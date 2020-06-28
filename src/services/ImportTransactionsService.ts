import { getCustomRepository, getRepository, In } from 'typeorm';
import fs from 'fs';
import csvParse from 'csv-parse';
import Transaction from '../models/Transaction';
import TransactionsRepository from '../repositories/TransactionsRepository';
import Category from '../models/Category';

interface CSVTransaction {
  title: string;
  value: number;
  type: 'income' | 'outcome';
  category: string;
}
class ImportTransactionsService {
  async execute(filePath: string): Promise<Transaction[]> {
    const transactionsRepository = getCustomRepository(TransactionsRepository);
    const categoriesRepository = getRepository(Category);

    const readCSVStream = fs.createReadStream(filePath);
    const parseStream = csvParse({
      from_line: 2, // iniciando a leitura a partir da linha dois (não tem a zero, começa da 1)
      ltrim: true,
      rtrim: true,
    });

    const parseCSV = readCSVStream.pipe(parseStream); // ler linha a linha até o fim

    const transactions: CSVTransaction[] = [];
    const categories: string[] = [];

    parseCSV.on('data', line => {
      /**
     *
     * método alternativo:
     * const [title, type, value, category] = line.map((cell: string) =>
        cell.trim(),
      );

      if (!title || !type || !value) return;

      categories.push(category);
      transactions.push({ title, type, value, category });

     */
      categories.push(line[3]);
      transactions.push({
        title: line[0],
        type: line[1],
        value: line[2],
        category: line[3],
      });
    });

    // esperando o evento 'end' que representa o fim da leitura do arquivo
    await new Promise(resolve => {
      parseCSV.on('end', resolve);
    });

    // console.log(categories);
    // console.log(transactions);

    const existentCategories = await categoriesRepository.find({
      where: {
        title: In(categories),
      },
    });

    const existentCategoriesTitles = existentCategories.map(
      (category: Category) => category.title,
    );

    const addCategoryTitles = categories
      .filter(
        category => !existentCategoriesTitles.includes(category), // inclui tudo o que não tem em existentCategories
      )
      .filter((value, index, self) => self.indexOf(value) === index); // filter que remove itens duplicados

    /**
     * explicando o filter acima
     * categories =
     * [0] food
     * [1] other
     * [2] food
     *
     * categories.indexof(food) === 0 ? true -> incluido no retorno
     * categories.indexof(other) === 1 ? true -> incluído no retorno
     * categories.indexof(food) === 2 ? false -> fora do retorno, pois o primeiro food que encontramos no array fica no index 0
     */

    const newCategories = categoriesRepository.create(
      addCategoryTitles.map(title => ({
        title,
      })),
    );

    await categoriesRepository.save(newCategories);

    const finalCategories = [...newCategories, ...existentCategories];

    const createdTransactions = transactionsRepository.create(
      transactions.map(transaction => ({
        title: transaction.title,
        type: transaction.type,
        value: transaction.value,
        category: finalCategories.find(
          category => category.title === transaction.category,
        ),
      })),
    );

    await transactionsRepository.save(createdTransactions);
    await fs.promises.unlink(filePath);

    return createdTransactions;
  }
}

export default ImportTransactionsService;
