require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const path = require('path');
const crypto = require('crypto');
const app = express();

app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

// Проверяем подключение при запуске
pool.connect(async (err, client, release) => {
    if (err) {
        console.error('Error connecting to the database:', err);
        return;
    }
    console.log('Successfully connected to database');
    
    try {
        // Создаем таблицы если они не существуют
        await client.query(`
            CREATE TABLE IF NOT EXISTS Users (
                id SERIAL PRIMARY KEY,
                username VARCHAR(255),
                telegram_id BIGINT,
                rating NUMERIC(12,8) DEFAULT 1500,
                rd NUMERIC(12,8) DEFAULT 350,
                volatility NUMERIC(8,8) DEFAULT 0.06,
                status BOOLEAN DEFAULT true
            );

            CREATE TABLE IF NOT EXISTS Settings (
                id SERIAL PRIMARY KEY,
                setting VARCHAR(255),
                meaning NUMERIC(10,3)
            );

            CREATE TABLE IF NOT EXISTS Tags (
                id SERIAL PRIMARY KEY,
                tag VARCHAR(255)
            );

            CREATE TABLE IF NOT EXISTS Types (
                id SERIAL PRIMARY KEY,
                type VARCHAR(255)
            );

            CREATE TABLE IF NOT EXISTS Puzzles (
                id SERIAL PRIMARY KEY,
                unique_task INTEGER,
                rating NUMERIC(12,8) DEFAULT 1500,
                rd NUMERIC(12,8) DEFAULT 350,
                volatility NUMERIC(8,8) DEFAULT 0.06,
                number INTEGER DEFAULT 0,
                fen1 VARCHAR(255),
                move1 VARCHAR(10),
                fen2 VARCHAR(255),
                move2 VARCHAR(10),
                solution BOOLEAN,
                type_id INTEGER REFERENCES Types(id),
                color BOOLEAN
            );

            CREATE TABLE IF NOT EXISTS Puzzles_Tags (
                id SERIAL PRIMARY KEY,
                puzzle_id INTEGER REFERENCES Puzzles(id),
                tag_id INTEGER REFERENCES Tags(id)
            );

            CREATE TABLE IF NOT EXISTS Complexity (
                id SERIAL PRIMARY KEY,
                complexity_type VARCHAR(255)
            );

            CREATE TABLE IF NOT EXISTS Journal (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES Users(id),
                puzzle_id INTEGER REFERENCES Puzzles(id),
                success BOOLEAN,
                time_success NUMERIC(5,2),
                puzzle_rating_before NUMERIC(12,8),
                user_rating_after NUMERIC(12,8),
                complexity_id INTEGER REFERENCES Complexity(id),
                date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // Инициализируем типы сложности
        await initializeComplexity();
        
        // Инициализируем типы
        await initializeTypes();
        
        // Инициализируем пользователей
        await initializeUsers();
        
        // Инициализируем настройки
        await initializeSettings();
        
        // Инициализируем задачи
        await initializePuzzles();
        
        // Инициализируем теги
        await initializeTags();
        
        // Инициализируем связи задач с тегами
        await initializePuzzlesTags();
        
        // Инициализируем журнал
        await initializeJournal();

    } catch (err) {
        console.error('Error during initialization:', err);
    } finally {
        release();
    }
});

// Добавляем обработчик ошибок для пула
pool.on('error', (err) => {
    console.error('Unexpected error on idle client', err);
    process.exit(-1);
});

// Функция для проверки доступа пользователя
async function checkUserAccess(username) {
    try {
        const result = await pool.query(
            'SELECT username FROM Users WHERE username = $1',
            [username]
        );
        return result.rows.length > 0;
    } catch (err) {
        console.error('Error checking user access:', err);
        return false;
    }
}

// Временно заменяем функцию generatePuzzlesList для отладки
async function generatePuzzlesList() {
    try {
        const result = await pool.query('SELECT * FROM Puzzles');
        console.log(`Found ${result.rows.length} puzzles in database`);
        
        if (result.rows.length === 0) {
            console.warn('No puzzles found in Puzzles table!');
            await initializePuzzles();
            return pool.query('SELECT * FROM Puzzles');
        }
        
        return result.rows;
    } catch (err) {
        console.error('Error getting puzzles from database:', err);
        console.error(err.stack);
        throw err;
    }
}

// Упрощаем generateRandomPuzzle, так как он больше не нужен
async function generateRandomPuzzle() {
    // Эта функция больше не используется
    throw new Error('Use findPuzzleForUser instead');
}

// Функция для проверки, пытался ли пользователь решить задачу
async function hasPuzzleAttempt(username, fen) {
    try {
        const result = await pool.query(
            'SELECT id FROM PuzzleAttempts WHERE username = $1 AND puzzle_fen = $2',
            [username, fen]
        );
        return result.rows.length > 0;
    } catch (err) {
        console.error('Error checking puzzle attempt:', err);
        return false;
    }
}

// Функция для получения нерешенных задач (упрощенная версия)
async function getUnsolvedPuzzles(username) {
    try {
        console.log(`Getting unsolved puzzles for user: ${username}`);
        
        // Получаем все попытки пользователя
        const attemptedResult = await pool.query(
            'SELECT puzzle_fen FROM PuzzleAttempts WHERE username = $1',
            [username]
        );
        const attemptedFens = attemptedResult.rows.map(row => row.puzzle_fen);
        console.log(`User has attempted ${attemptedFens.length} puzzles`);
        
        // Получаем все доступные задачи
        const puzzles = await generatePuzzlesList();
        console.log(`Total available puzzles: ${puzzles.length}`);
        
        // Возвращаем только те задачи, которые пользователь еще не пытался решить
        const unsolvedPuzzles = puzzles.filter(puzzle => !attemptedFens.includes(puzzle.fen));
        console.log(`Unsolved puzzles: ${unsolvedPuzzles.length}`);
        
        return unsolvedPuzzles;
    } catch (err) {
        console.error('Error getting unsolved puzzles:', err);
        throw err;
    }
}

// Обновляем функцию для инициализации задач
async function initializePuzzles() {
    try {
        // Очищаем существующие задачи
        await pool.query('DELETE FROM Puzzles');
        
        // Сбрасываем последовательность
        await pool.query('ALTER SEQUENCE puzzles_id_seq RESTART WITH 1');
        
        // Добавляем задачи из таблицы
        const puzzles = [
            {
                id: 1,
                rating: 1500.00,
                rd: 350.00,
                volatility: 0.06000000,
                number: 0,
                fen1: '2B5/2r5/1p1k2pp/p1r5/P1P2P2/6P1/2K4P/4R3 w - - 0 2',
                move1: 'e1e6',
                fen2: '2B5/2r5/1p1k2pp/p1r5/P1P2P2/6P1/2K4P/4R3 w - - 0 2',
                move2: '',
                solution: false,
                type_id: 4,
                color: true
            },
            {
                id: 2,
                rating: 1500.00,
                rd: 350.00,
                volatility: 0.06000000,
                number: 0,
                fen1: 'r1bqk2r/ppp1bpp1/2n2n2/6B1/4p3/2P2NPp/PPQNPP1P/R3KB1R w KQkq - 0 2',
                move1: 'd2e4',
                fen2: 'r1bqk2r/ppp1bpp1/2n2n2/6B1/4p3/2P2NPp/PPQNPP1P/R3KB1R w KQkq - 0 2',
                move2: '',
                solution: true,
                type_id: 3,
                color: false
            },
            {
                id: 3,
                rating: 1500.00,
                rd: 350.00,
                volatility: 0.06000000,
                number: 0,
                fen1: 'r3kb1r/ppqnpp1p/2p2npP/4P3/6b1/2N2N2/PPP1BPP1/R1BQ1RK1 b kq - 0 1',
                move1: 'g4e2',
                fen2: 'r3kb1r/ppqnpp1p/2p2npP/4P3/6b1/2N2N2/PPP1BPP1/R1BQ1RK1 b kq - 0 1',
                move2: '',
                solution: false,
                type_id: 5,
                color: false
            },
            {
                id: 4,
                rating: 1500.00,
                rd: 350.00,
                volatility: 0.06000000,
                number: 0,
                fen1: 'r2qk2r/pp2npbp/2npb1p1/1N6/2PN4/6P1/PP3PBP/R1BQ1RK1 b kq - 0 1',
                move1: 'e6c4',
                fen2: 'r2qk2r/pp2npbp/2npb1p1/1N6/2PN4/6P1/PP3PBP/R1BQ1RK1 b kq - 0 1',
                move2: '',
                solution: false,
                type_id: 7,
                color: true
            },
            {
                id: 5,
                rating: 1500.00,
                rd: 350.00,
                volatility: 0.06000000,
                number: 0,
                fen1: 'r3r1k1/1pp2ppp/p2pb3/3B4/2Q2P2/2N1b1Pq/PPP4P/4RR1K w - - 1 2',
                move1: 'e1e3',
                fen2: 'r3r1k1/1pp2ppp/p2pb3/3B4/2Q2P2/2N1b1Pq/PPP4P/4RR1K w - - 1 2',
                move2: '',
                solution: true,
                type_id: 1,
                color: false
            },
            {
                id: 6,
                rating: 1500.00,
                rd: 350.00,
                volatility: 0.06000000,
                number: 0,
                fen1: '8/1pBrR3/p1bP4/P6p/5k2/7p/8/6K1 b - - 1 1',
                move1: 'f4g1',
                fen2: '8/1pBrR3/p1bP4/P6p/5k2/7p/8/6K1 b - - 1 1',
                move2: '',
                solution: false,
                type_id: 4,
                color: false
            },
            {
                id: 7,
                rating: 1400.00,
                rd: 350.00,
                volatility: 0.06000000,
                number: 0,
                fen1: 'rn1qkbnr/pp3ppp/2pp4/4p3/2B1P1b1/2NP1N2/PPP2PPP/R1BQK2R b KQkq - 0 5',
                move1: 'b7b5',
                fen2: 'rn1qkbnr/p4ppp/2pp4/1p2p3/2B1P1b1/2NP1N2/PPP2PPP/R1BQK2R w KQkq - 0 6',
                move2: '',
                solution: false,
                type_id: 5,
                color: true
            },
            {
                id: 8,
                rating: 1400.00,
                rd: 350.00,
                volatility: 0.06000000,
                number: 0,
                fen1: 'r1bqk2r/ppp2ppp/2np1n2/2b1p1B1/4P3/2PP4/PP3PPP/RN1QKBNR w KQkq - 0 5',
                move1: 'b2b4',
                fen2: 'r1bqk2r/ppp2ppp/2np1n2/2b1p1B1/1P2P3/2PP4/P4PPP/RN1QKBNR b KQkq - 0 5',
                move2: '',
                solution: true,
                type_id: 2,
                color: false
            },
            {
                id: 9,
                rating: 1200.00,
                rd: 350.00,
                volatility: 0.06000000,
                number: 0,
                fen1: 'rn1qkbnr/p4ppp/2pp4/1p2p3/2B1P1b1/2NP1N2/PPP2PPP/R1BQK2R w KQkq - 0 6',
                move1: 'c4f7',
                fen2: 'rn1qkbnr/p4Bpp/2pp4/1p2p3/4P1b1/2NP1N2/PPP2PPP/R1BQK2R b KQkq - 0 6',
                move2: '',
                solution: true,
                type_id: 1,
                color: true
            },
            {
                id: 10,
                rating: 1300.00,
                rd: 350.00,
                volatility: 0.06000000,
                number: 0,
                fen1: 'r1bqk2r/ppp2ppp/2np1n2/2b1p1B1/1P2P3/2PP4/P4PPP/RN1QKBNR b KQkq - 0 6',
                move1: 'f6f2',
                fen2: 'r1bqk2r/ppp2ppp/2np1n2/4p1B1/1P2P3/2PP4/P4bPP/RN1QKBNR w KQkq - 0 7',
                move2: '',
                solution: false,
                type_id: 4,
                color: true
            },
            {
                id: 11,
                rating: 1200.00,
                rd: 350.00,
                volatility: 0.06000000,
                number: 0,
                fen1: '8/3b2p1/pppBk2p/2P5/1P6/P7/5PPP/4K3 w - - 0 26',
                move1: 'c5c6',
                fen2: '8/3b2p1/pPpBk2p/8/1P6/P7/5PPP/4K3 b - - 0 26',
                move2: '',
                solution: true,
                type_id: 1,
                color: true
            },
            {
                id: 12,
                rating: 1500.00,
                rd: 350.00,
                volatility: 0.06000000,
                number: 0,
                fen1: '4k3/5ppp/p7/1p6/2p5/PPPbK2P/3B2P1/8 b - - 0 26',
                move1: 'c4b3',
                fen2: '4k3/5ppp/p7/1p6/8/PpPbK2P/3B2P1/8 w - - 0 27',
                move2: '',
                solution: false,
                type_id: 2,
                color: true
            },
            {
                id: 13,
                rating: 1500.00,
                rd: 350.00,
                volatility: 0.06000000,
                number: 0,
                fen1: '3RR3/1kr5/1ppB1r2/8/p1P4P/P7/1P3bK1/8 b - - 0 1',
                move1: 'f6g6',
                fen2: '3RR3/1k4r1/1ppB1r2/8/p1P4P/P7/1P3bK1/8 w - - 1 2',
                move2: '',
                solution: false,
                type_id: 6,
                color: true
            },
            {
                id: 14,
                rating: 1500.00,
                rd: 350.00,
                volatility: 0.06000000,
                number: 0,
                fen1: '8/4ppkp/p3q1p1/1pr3P1/6n1/1P2PN2/P3QPP1/3R2K1 w - - 0 1',
                move1: 'e2b2',
                fen2: '8/4ppkp/p3q1p1/1pr3P1/6n1/1P2PN2/PQ3PP1/3R2K1 b - - 1 1',
                move2: '',
                solution: false,
                type_id: 7,
                color: true
            },
            {
                id: 15,
                rating: 1500.00,
                rd: 350.00,
                volatility: 0.06000000,
                number: 0,
                fen1: '1r6/kb1q1p1p/p3p1pP/B1QpPnP1/3P1P2/P7/K3N3/1R6 b - - 0 1',
                move1: 'b8a8',
                fen2: 'kr6/1b1q1p1p/p3p1pP/B1QpPnP1/3P1P2/P7/K3N3/1R6 w - - 1 2',
                move2: '',
                solution: false,
                type_id: 4,
                color: true
            }
        ];

        // Вставляем все задачи
        for (const puzzle of puzzles) {
            await pool.query(
                `INSERT INTO Puzzles (
                    id, rating, rd, volatility, number, 
                    fen1, move1, fen2, move2, 
                    solution, type_id, color
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
                [
                    puzzle.id,
                    puzzle.rating,
                    puzzle.rd,
                    puzzle.volatility,
                    puzzle.number,
                    puzzle.fen1,
                    puzzle.move1,
                    puzzle.fen2,
                    puzzle.move2,
                    puzzle.solution,
                    puzzle.type_id,
                    puzzle.color
                ]
            );
        }
        
        // Сбрасываем последовательность id
        await pool.query('SELECT setval(\'puzzles_id_seq\', (SELECT MAX(id) FROM Puzzles))');
        
        console.log('Puzzles initialized successfully');
    } catch (err) {
        console.error('Error initializing puzzles:', err);
        throw err;
    }
}

// Функция для поиска задачи с учетом всех критериев
async function findPuzzleWithCriteria(userId, userRating, userPerformance) {
    try {
        // Получаем все настройки
        const settingsResult = await pool.query('SELECT setting, meaning FROM Settings');
        const settings = settingsResult.rows.reduce((acc, row) => {
            acc[row.setting] = row.meaning;
            return acc;
        }, {});

        // Получаем базовые вероятности для типов задач
        const typesProbabilities = {
            'лучший': settings['Базовая вероятность критерия "лучший"'],
            'защита': settings['Базовая вероятность критерия "защита"'],
            'обычный': settings['Базовая вероятность критерия "обычный"'],
            'пропуск': settings['Базовая вероятность критерия "пропуск"'],
            'фейк': settings['Базовая вероятность критерия "фейк"'],
            'нет защиты': settings['Базовая вероятность критерия "нет защиты"'],
            'подстава': settings['Базовая вероятность критерия "подстава"']
        };

        // Получаем базовые вероятности для сложности
        const complexityProbabilities = {
            'супер легкая': settings['Базовая вероятность критерия "супер легкая"'],
            'очень легкая': settings['Базовая вероятность критерия "очень легкая"'],
            'легкая': settings['Базовая вероятность критерия "легкая"'],
            'средняя': settings['Базовая вероятность критерия "средняя"'],
            'сложная': settings['Базовая вероятность критерия "сложная"'],
            'очень сложная': settings['Базовая вероятность критерия "очень сложная"'],
            'супер сложная': settings['Базовая вероятность критерия "супер сложная"']
        };

        // Коэффициент понижения базовой вероятности
        const probabilityReductionCoef = settings['Коэффициент понижения базовой вероятности'];

        // Получаем все нерешенные задачи с их типами
        const puzzlesResult = await pool.query(`
            SELECT 
                p.*,
                t.type as puzzle_type,
                COALESCE(
                    (SELECT complexity_type 
                     FROM Journal j 
                     JOIN Complexity c ON j.complexity_id = c.id 
                     WHERE j.puzzle_id = p.id 
                     ORDER BY j.date DESC 
                     LIMIT 1),
                    'средняя'
                ) as last_complexity
            FROM Puzzles p
            LEFT JOIN Types t ON p.type_id = t.id
            WHERE p.id NOT IN (
                SELECT puzzle_id 
                FROM Journal 
                WHERE user_id = $1
            )
        `, [userId]);

        if (puzzlesResult.rows.length === 0) {
            // Если все задачи решены, очищаем историю
            await pool.query(`
                DELETE FROM Journal 
                WHERE user_id = $1 
                AND id IN (
                    SELECT id 
                    FROM Journal 
                    WHERE user_id = $1 
                    ORDER BY date ASC 
                    LIMIT (SELECT COUNT(*)/2 FROM Journal WHERE user_id = $1)
                )
            `, [userId]);
            return findPuzzleWithCriteria(userId, userRating, userPerformance);
        }

        // Вычисляем вероятность выбора для каждой задачи
        const puzzlesWithProbabilities = puzzlesResult.rows.map(puzzle => {
            // Базовая вероятность по типу
            let probability = typesProbabilities[puzzle.puzzle_type] || 0.5;
            
            // Учитываем сложность
            probability *= complexityProbabilities[puzzle.last_complexity] || 0.35;
            
            // Учитываем рейтинг
            const ratingDiff = Math.abs(puzzle.rating - userRating);
            if (ratingDiff > 300) {
                probability *= probabilityReductionCoef;
            }
            
            // Учитываем перформанс
            if (userPerformance && Math.abs(puzzle.rating - userPerformance) > settings['Стандартное отклонение']) {
                probability *= probabilityReductionCoef;
            }

            return {
                ...puzzle,
                probability
            };
        });

        // Нормализуем вероятности
        const totalProbability = puzzlesWithProbabilities.reduce((sum, p) => sum + p.probability, 0);
        puzzlesWithProbabilities.forEach(p => p.probability /= totalProbability);

        // Выбираем задачу случайным образом с учетом вероятностей
        const random = Math.random();
        let cumulativeProbability = 0;
        
        for (const puzzle of puzzlesWithProbabilities) {
            cumulativeProbability += puzzle.probability;
            if (random <= cumulativeProbability) {
                return puzzle;
            }
        }

        // Если по какой-то причине не выбрали задачу, возвращаем случайную
        return puzzlesWithProbabilities[Math.floor(Math.random() * puzzlesWithProbabilities.length)];
    } catch (err) {
        console.error('Error in findPuzzleWithCriteria:', err);
        throw err;
    }
}

// Обновляем функцию findPuzzleForUser
async function findPuzzleForUser(username) {
    try {
        console.log(`Finding puzzle for user: ${username}`);
        
        // Получаем информацию о пользователе
        const userResult = await pool.query(
            'SELECT id, rating, performance FROM Users WHERE username = $1',
            [username]
        );
        
        if (userResult.rows.length === 0) {
            throw new Error('User not found');
        }
        
        const userId = userResult.rows[0].id;
        const userRating = userResult.rows[0].rating;
        const userPerformance = userResult.rows[0].performance;

        // Используем новую функцию для поиска задачи
        return findPuzzleWithCriteria(userId, userRating, userPerformance);
    } catch (err) {
        console.error('Error in findPuzzleForUser:', err);
        throw err;
    }
}

// Функция для инициализации рейтинга нового пользователя
async function initializeUserRating(username) {
    try {
        const result = await pool.query(
            `INSERT INTO Journal 
            (username, puzzle_id, success, time, rating, rd, volatility)
            VALUES ($1, 0, true, 0, 1500, 350, 0.06)
            RETURNING rating, rd, volatility`,
            [username]
        );
        return result.rows[0];
    } catch (err) {
        console.error('Error initializing user rating:', err);
        throw err;
    }
}

// Обновляем функцию getUserRating
async function getUserRating(username) {
    try {
        // Получаем пользователя по username
        const userResult = await pool.query(
            'SELECT id, rating, rd, volatility FROM Users WHERE username = $1',
            [username]
        );

        // Если пользователь не найден, создаем нового
        if (userResult.rows.length === 0) {
            const newUser = await pool.query(
                `INSERT INTO Users (username, rating, rd, volatility, status) 
                 VALUES ($1, 1500, 350, 0.06, true) 
                 RETURNING id, rating, rd, volatility`,
                [username]
            );
            return newUser.rows[0];
        }

        return userResult.rows[0];
    } catch (err) {
        console.error('Error getting user rating:', err);
        throw err;
    }
}

// Функция для получения рейтинга задачи
async function getPuzzleRating(puzzleId) {
    try {
        const result = await pool.query(
            'SELECT rating, rd, volatility FROM Puzzles WHERE id = $1',
            [puzzleId]
        );
        
        if (result.rows.length === 0) {
            throw new Error('Puzzle not found');
        }
        
        return {
            rating: result.rows[0].rating,
            rd: result.rows[0].rd,
            volatility: result.rows[0].volatility
        };
    } catch (err) {
        console.error('Error getting puzzle rating:', err);
        throw err;
    }
}

// Функция для получения настроек
async function getSettings() {
    try {
        const result = await pool.query('SELECT * FROM Settings');
        if (result.rows.length === 0) {
            return {
                normal_time: 60,
                tau: 0.5,
                epsilon: 0.000001
            };
        }
        return result.rows.reduce((acc, row) => {
            acc[row.parameter_name] = row.parameter_value;
            return acc;
        }, {});
    } catch (err) {
        console.error('Error getting settings:', err);
        throw err;
    }
}

// Обновляем функцию recordPuzzleSolution
async function recordPuzzleSolution(username, puzzleId, success, time) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        console.log('Starting transaction for solution recording');

        // Получаем ID пользователя и его текущий рейтинг
        const userResult = await client.query(
            'SELECT id, rating, rd, volatility FROM Users WHERE username = $1',
            [username]
        );

        if (userResult.rows.length === 0) {
            throw new Error(`User ${username} not found`);
        }

        const userId = userResult.rows[0].id;
        const userRating = userResult.rows[0];

        // Получаем информацию о задаче
        const puzzleResult = await client.query(
            'SELECT rating, rd, volatility FROM Puzzles WHERE id = $1',
            [puzzleId]
        );

        if (puzzleResult.rows.length === 0) {
            throw new Error(`Puzzle ${puzzleId} not found`);
        }

        const puzzleRating = puzzleResult.rows[0];
        console.log('Current ratings:', { user: userRating, puzzle: puzzleRating });

        // Рассчитываем новые рейтинги
        const newRatings = calculateNewRatings(userRating, puzzleRating, success ? 1 : 0);
        console.log('New ratings calculated:', newRatings);

        // Обновляем рейтинг пользователя
        await client.query(
            `UPDATE Users 
             SET rating = $1, rd = $2, volatility = $3 
             WHERE id = $4`,
            [newRatings.userRating, newRatings.userRD, newRatings.userVolatility, userId]
        );

        // Обновляем рейтинг задачи
        await client.query(
            `UPDATE Puzzles 
             SET rating = $1, rd = $2, volatility = $3, number = number + 1 
             WHERE id = $4`,
            [newRatings.puzzleRating, newRatings.puzzleRD, newRatings.puzzleVolatility, puzzleId]
        );

        // Определяем сложность на основе времени
        const complexityType = time < 30 ? 'easy' : time < 90 ? 'medium' : 'hard';
        
        // Записываем результат в журнал
        await client.query(
            `INSERT INTO Journal 
             (user_id, puzzle_id, success, time_success, puzzle_rating_before, user_rating_after, complexity_id) 
             VALUES ($1, $2, $3, $4, $5, $6, 
                    (SELECT id FROM Complexity WHERE complexity_type = $7))`,
            [
                userId,
                puzzleId,
                success,
                time,
                puzzleRating.rating,
                newRatings.userRating,
                complexityType
            ]
        );

        await client.query('COMMIT');
        console.log('Transaction committed successfully');
        
        return {
            userRating: newRatings.userRating,
            userRD: newRatings.userRD,
            userVolatility: newRatings.userVolatility
        };
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error in recordPuzzleSolution:', err);
        throw err;
    } finally {
        client.release();
    }
}

// Обновляем функцию calculateNewRatings без жесткого ограничения
function calculateNewRatings(userRating, puzzleRating, R) {
    // Константы
    const q = Math.log(10) / 400;
    const c = 34.6;
    
    // Шаг 1: Определение отклонения рейтинга (RD)
    const RD = Math.min(Math.sqrt(userRating.rd * userRating.rd + c * c), 350);
    
    // Шаг 2: Определение нового рейтинга
    const g = 1 / Math.sqrt(1 + 3 * q * q * puzzleRating.rd * puzzleRating.rd / (Math.PI * Math.PI));
    const E = 1 / (1 + Math.pow(10, g * (userRating.rating - puzzleRating.rating) / -400));
    const d2 = 1 / (q * q * g * g * E * (1 - E));
    
    // Вычисляем изменение рейтинга без ограничений
    const ratingChange = (q / (1 / (RD * RD) + 1 / d2)) * g * (R - E);
    
    // Преобразуем строковые значения в числовые и выполняем вычисление
    const newRating = parseFloat(userRating.rating) + ratingChange;
    
    // Шаг 3: Определение нового отклонения рейтинга
    const newRD = Math.sqrt(1 / (1 / (RD * RD) + 1 / d2));
    
    return {
        userRating: newRating.toFixed(8),
        userRD: newRD,
        userVolatility: userRating.volatility
    };
}

// API endpoints
app.get('/api/user-rating/:username', async (req, res) => {
    try {
        const result = await getUserRating(req.params.username);
        res.json({
            rating: result.rating,
            rd: result.rd,
            volatility: result.volatility
        });
    } catch (err) {
        console.error('Error getting user rating:', err);
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/check-access/:username', async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT status FROM Users WHERE username = $1',
            [req.params.username]
        );
        res.json({ hasAccess: result.rows.length > 0 && result.rows[0].status });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/random-puzzle/:username', async (req, res) => {
    try {
        const username = req.params.username;
        console.log(`Getting random puzzle for user: ${username}`);
        
        // Получаем случайную задачу
        const puzzle = await findPuzzleForUser(username);
        
        if (!puzzle) {
            throw new Error('No available puzzles found');
        }

        // Преобразуем boolean в строку для solution и color
        const response = {
            ...puzzle,
            solution: puzzle.solution ? 'Good' : 'Blunder',
            color: puzzle.color ? 'w' : 'b'
        };

        res.json(response);
    } catch (err) {
        console.error('Error in /api/random-puzzle:', err);
        res.status(500).json({ 
            error: err.message,
            stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
        });
    }
});

app.post('/api/record-solution', async (req, res) => {
    try {
        const { username, puzzleId, success, time } = req.body;
        console.log('Received solution data:', { username, puzzleId, success, time });
        
        // Проверяем наличие всех необходимых параметров
        if (!username || puzzleId === undefined || success === undefined || time === undefined) {
            console.log('Missing parameters:', { username, puzzleId, success, time });
            return res.status(400).json({ 
                error: 'Missing required parameters',
                received: { username, puzzleId, success, time }
            });
        }

        // Проверяем существование пользователя
        const userExists = await pool.query('SELECT id FROM Users WHERE username = $1', [username]);
        if (userExists.rows.length === 0) {
            // Если пользователя нет, создаем его
            await pool.query(
                'INSERT INTO Users (username, rating, rd, volatility, status) VALUES ($1, 1500, 350, 0.06, true)',
                [username]
            );
        }

        // Проверяем существование задачи
        const puzzleExists = await pool.query('SELECT id FROM Puzzles WHERE id = $1', [puzzleId]);
        if (puzzleExists.rows.length === 0) {
            return res.status(404).json({ error: 'Puzzle not found' });
        }

        const result = await recordPuzzleSolution(username, puzzleId, success, time);
        
        res.json({
            status: 'success',
            rating: result.userRating,
            rd: result.userRD,
            volatility: result.userVolatility
        });
    } catch (err) {
        console.error('Error in /api/record-solution:', err);
        res.status(500).json({ 
            error: 'Internal server error',
            message: err.message,
            details: process.env.NODE_ENV === 'development' ? err.stack : undefined
        });
    }
});

// Добавляем обработку favicon.ico
app.get('/favicon.ico', (req, res) => {
    res.status(204).end();
});

// Добавляем раздачу статических файлов
app.use(express.static(path.join(__dirname)));

// Добавляем маршрут для index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Добавляем функцию getSettings
async function getSettings() {
    try {
        const result = await pool.query('SELECT * FROM Settings LIMIT 1');
        return result.rows[0] || { normal_time: 60 };
    } catch (err) {
        console.error('Error getting settings:', err);
        return { normal_time: 60 };
    }
}

// Добавляем функцию getPuzzleRating
async function getPuzzleRating(puzzleId) {
    try {
        const result = await pool.query(
            'SELECT rating, rd, volatility FROM Puzzles WHERE id = $1',
            [puzzleId]
        );
        return result.rows[0];
    } catch (err) {
        console.error('Error getting puzzle rating:', err);
        throw err;
    }
}

// Функция проверки данных от Telegram
function validateTelegramWebAppData(telegramInitData) {
    const initData = new URLSearchParams(telegramInitData);
    const hash = initData.get('hash');
    const botToken = process.env.BOT_TOKEN; // Токен вашего бота

    // Удаляем hash из проверяемых данных
    initData.delete('hash');
    
    // Сортируем оставшиеся поля
    const dataCheckString = Array.from(initData.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, value]) => `${key}=${value}`)
        .join('\n');

    // Создаем HMAC-SHA256
    const secret = crypto.createHmac('sha256', 'WebAppData')
        .update(botToken)
        .digest();
    
    const calculatedHash = crypto.createHmac('sha256', secret)
        .update(dataCheckString)
        .digest('hex');

    return calculatedHash === hash;
}

// Добавляем middleware для проверки авторизации
app.use('/api', (req, res, next) => {
    const initData = req.headers['x-telegram-init-data'];
    
    if (!initData || !validateTelegramWebAppData(initData)) {
        // В режиме разработки пропускаем проверку
        if (process.env.NODE_ENV === 'development') {
            return next();
        }
        return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
});

// Добавляем тестовый эндпоинт для проверки БД
app.get('/api/test-db', async (req, res) => {
    try {
        // Проверяем подключение к БД
        const dbCheck = await pool.query('SELECT NOW()');
        
        // Проверяем основные таблицы
        const tablesCheck = await pool.query(`
            SELECT 
                (SELECT COUNT(*) FROM users) as users_count,
                (SELECT COUNT(*) FROM puzzles) as puzzles_count,
                (SELECT COUNT(*) FROM types) as types_count,
                (SELECT COUNT(*) FROM tags) as tags_count,
                (SELECT COUNT(*) FROM puzzles_tags) as puzzles_tags_count,
                (SELECT COUNT(*) FROM journal) as journal_count,
                (SELECT COUNT(*) FROM complexity) as complexity_count,
                (SELECT COUNT(*) FROM settings) as settings_count
        `);
        
        res.json({
            status: 'success',
            timestamp: dbCheck.rows[0].now,
            tables: tablesCheck.rows[0]
        });
    } catch (err) {
        console.error('Database test failed:', err);
        res.status(500).json({
            status: 'error',
            message: err.message,
            details: process.env.NODE_ENV === 'development' ? err.stack : undefined
        });
    }
});

// Изменим порт на переменную окружения
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

// Функция для проверки, решал ли пользователь эту задачу
async function isPuzzleSolved(username, fen) {
    try {
        const result = await pool.query(
            'SELECT id FROM SolvedPuzzles WHERE username = $1 AND puzzle_fen = $2',
            [username, fen]
        );
        return result.rows.length > 0;
    } catch (err) {
        console.error('Error checking solved puzzle:', err);
        return false;
    }
}

// Обновляем функцию markPuzzleAsSolved, чтобы она возвращала Promise
async function markPuzzleAsSolved(username, fen) {
    try {
        await pool.query(
            `INSERT INTO SolvedPuzzles (username, puzzle_fen) 
             VALUES ($1, $2) 
             ON CONFLICT (username, puzzle_fen) DO NOTHING`,
            [username, fen]
        );
        console.log(`Marked puzzle ${fen} as solved for user ${username}`);
    } catch (err) {
        console.error('Error marking puzzle as solved:', err);
        throw err; // Пробрасываем ошибку дальше
    }
}

// Функция для расчёта нового отклонения рейтинга (RD) по алгоритму Глико
function calculateNewRD(RD0, t, c = 34.6) {
    // Формула: RD = min(sqrt(RD0^2 + c^2*t), 350)
    const newRD = Math.sqrt(Math.pow(RD0, 2) + Math.pow(c, 2) * t);
    return Math.min(newRD, 350);
}

// Константа q для алгоритма Глико
const q = Math.log(10) / 400; // = 0.00575646273

// Функция g(RD) для алгоритма Глико
function g(RD) {
    return 1 / Math.sqrt(1 + 3 * q * q * RD * RD / (Math.PI * Math.PI));
}

// Функция E для алгоритма Глико
function E(r0, ri, RDi) {
    return 1 / (1 + Math.pow(10, (-g(RDi) * (r0 - ri)) / 400));
}

// Функция для расчёта d^2
function calculateD2(opponents) {
    let sum = 0;
    for (const opp of opponents) {
        const gRD = g(opp.RD);
        const eValue = E(opp.r, opp.r0, opp.RD);
        sum += Math.pow(gRD, 2) * eValue * (1 - eValue);
    }
    return 1 / (Math.pow(q, 2) * sum);
}

// Функция для расчёта нового рейтинга
function calculateNewRating(r0, RD, opponents) {
    // Рассчитываем d^2
    const d2 = calculateD2(opponents);
    
    // Рассчитываем сумму в числителе
    let sum = 0;
    for (const opp of opponents) {
        sum += g(opp.RD) * (opp.s - E(r0, opp.r, opp.RD));
    }
    
    // Рассчитываем новый рейтинг по формуле
    const newRating = r0 + (q / (1/Math.pow(RD, 2) + 1/d2)) * sum;
    
    return newRating;
}

// Функция для расчёта нового отклонения рейтинга по Глико-2
function calculateNewRDPrime(RD, d2) {
    // Формула: RD' = sqrt(1 / (1/RD² + 1/d²))
    return Math.sqrt(1 / (1/Math.pow(RD, 2) + 1/d2));
}

// Функция g(φ) для Глико-2
function gPhi(phi) {
    return 1 / Math.sqrt(1 + 3 * Math.pow(phi, 2) / (Math.PI * Math.PI));
}

// Функция E(μ, μj, φj) для Глико-2
function expectation(mu, muJ, phiJ) {
    return 1 / (1 + Math.exp(-gPhi(phiJ) * (mu - muJ)));
}

// Функция для вычисления v (вспомогательная величина)
function calculateV(opponents, mu) {
    let sum = 0;
    for (const opp of opponents) {
        const gPhiJ = gPhi(opp.phi);
        const E = expectation(mu, opp.mu, opp.phi);
        sum += Math.pow(gPhiJ, 2) * E * (1 - E);
    }
    return Math.pow(sum, -1);
}

// Функция для вычисления Δ (вспомогательная величина)
function calculateDelta(opponents, mu) {
    let sum = 0;
    for (const opp of opponents) {
        const gPhiJ = gPhi(opp.phi);
        const E = expectation(mu, opp.mu, opp.phi);
        sum += gPhiJ * (opp.s - E);
    }
    return calculateV(opponents, mu) * sum;
}

// Функция для преобразования рейтинга в шкалу Глико-2
function convertToGlicko2Scale(rating, rd) {
    const mu = (rating - 1500) / 173.7178;
    const phi = rd / 173.7178;
    return { mu, phi };
}

// Функция для преобразования обратно в шкалу рейтинга
function convertFromGlicko2Scale(mu, phi) {
    const rating = 173.7178 * mu + 1500;
    const rd = 173.7178 * phi;
    return { rating, rd };
}

// Константа τ для алгоритма Глико-2
const TAU = 0.2;
const EPSILON = 0.000001;

// Функция f(x) для итерационного процесса
function f(x, delta, phi, v, sigma2, tau2) {
    const ex = Math.exp(x);
    return (ex * (delta*delta - phi*phi - v - ex)) / (2 * Math.pow(phi*phi + v + ex, 2)) - (x - Math.log(sigma2)) / tau2;
}

// Функция для поиска значения A методом половинного деления
function findA(sigma, phi, v, delta) {
    const tau2 = TAU * TAU;
    const sigma2 = sigma * sigma;
    
    // Начальное значение a = ln(σ²)
    const a = Math.log(sigma2);
    
    // Находим подходящее значение для b
    let b;
    if (delta*delta > phi*phi + v) {
        b = Math.log(delta*delta - phi*phi - v);
    } else {
        k = 1;
        while (f(a - k * TAU, delta, phi, v, sigma2, tau2) < 0) {
            k = k + 1;
        }
        b = a - k * TAU;
    }
    
    // Метод половинного деления
    let c;
    let fa = f(a, delta, phi, v, sigma2, tau2);
    let fb = f(b, delta, phi, v, sigma2, tau2);
    
    while (Math.abs(b - a) > EPSILON) {
        c = (a + b) / 2;
        let fc = f(c, delta, phi, v, sigma2, tau2);
        if (fc * fa < 0) {
            b = c;
            fb = fc;
        } else {
            a = c;
            fa = fc;
        }
    }
    
    return (a + b) / 2;
}

// Функция для вычисления нового рейтинга μ'
function calculateNewMu(mu, phi, opponents) {
    let sum = 0;
    for (const opp of opponents) {
        sum += gPhi(opp.phi) * (opp.s - expectation(mu, opp.mu, opp.phi));
    }
    return mu + Math.pow(phi, 2) * sum;
}

// Функция для вычисления нового φ'
function calculateNewPhi(phi, sigma, v) {
    return 1 / Math.sqrt(1 / (phi*phi + sigma*sigma) + 1/v);
}

// Обновляем функцию updateRating для использования правильного алгоритма Глико-2
async function updateRating(username, puzzleId, success) {
    try {
        // Получаем текущий рейтинг пользователя
        const userRating = await getUserRating(username);
        
        // Получаем рейтинг задачи
        const puzzleRating = await getPuzzleRating(puzzleId);
        
        // Шаг 1: Преобразуем рейтинги в шкалу Глико-2
        const { mu: userMu, phi: userPhi } = convertToGlicko2Scale(userRating.rating, userRating.rd);
        const { mu: puzzleMu, phi: puzzlePhi } = convertToGlicko2Scale(puzzleRating.rating, puzzleRating.rd);
        
        // Формируем массив противников (в данном случае одна задача)
        const opponents = [{
            mu: puzzleMu,
            phi: puzzlePhi,
            s: success ? 1 : 0
        }];
        
        // Шаг 1: Вычисляем вспомогательные величины v и Δ
        const v = calculateV(opponents, userMu);
        const delta = calculateDelta(opponents, userMu);
        
        // Шаг 2: Вычисляем новую волатильность
        const sigma = userRating.volatility;
        const A = findA(sigma, userPhi, v, delta);
        const newVolatility = Math.exp(A/2);
        
        // Шаг 3: Вычисляем новое φ'
        const newPhi = calculateNewPhi(userPhi, newVolatility, v);
        
        // Шаг 4: Вычисляем новый рейтинг μ'
        const newMu = calculateNewMu(userMu, newPhi, opponents);
        
        // Преобразуем обратно в обычную шкалу
        const { rating: finalRating, rd: finalRD } = convertFromGlicko2Scale(newMu, newPhi);
        
        // Обновляем рейтинг в базе данных
        await pool.query(
            `INSERT INTO Journal 
            (username, puzzle_id, success, time, rating, rd, volatility)
            VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
                username,
                puzzleId,
                success,
                0, // время пока не используем
                finalRating,
                Math.min(finalRD, 350),
                newVolatility
            ]
        );
        
        // Добавляем задачу в список решённых
        await markPuzzleAsSolved(username, puzzleRating.fen);
        
        // Возвращаем обновленные значения
        return {
            rating: finalRating,
            rd: Math.min(finalRD, 350),
            volatility: newVolatility
        };
    } catch (err) {
        console.error('Error updating rating:', err);
        throw err;
    }
}

// Обновляем функцию calculateV для точного соответствия формуле
function calculateV(opponents, mu) {
    let sum = 0;
    for (const opp of opponents) {
        const gPhiJ = gPhi(opp.phi);
        const E = expectation(mu, opp.mu, opp.phi);
        sum += Math.pow(gPhiJ, 2) * E * (1 - E);
    }
    return Math.pow(sum, -1);
}

// Обновляем функцию calculateDelta для точного соответствия формуле
function calculateDelta(opponents, mu) {
    let sum = 0;
    for (const opp of opponents) {
        const gPhiJ = gPhi(opp.phi);
        const E = expectation(mu, opp.mu, opp.phi);
        sum += gPhiJ * (opp.s - E);
    }
    return calculateV(opponents, mu) * sum;
}

// Обновляем функцию calculateNewPhi для точного соответствия формуле
function calculateNewPhi(phi, sigma, v) {
    return 1 / Math.sqrt(1 / (phi*phi + sigma*sigma) + 1/v);
}

// Обновляем функцию calculateNewMu для точного соответствия формуле
function calculateNewMu(mu, phi, opponents) {
    let sum = 0;
    for (const opp of opponents) {
        sum += gPhi(opp.phi) * (opp.s - expectation(mu, opp.mu, opp.phi));
    }
    return mu + Math.pow(phi, 2) * sum;
}

// Обновляем функцию для инициализации пользователей
async function initializeUsers() {
    try {
        // Очищаем существующих пользователей
        await pool.query('DELETE FROM Users');
        
        // Добавляем пользователей из таблицы
        const users = [
            {
                id: 1,
                username: 'goodwillchess',
                telegram_id: 1931999392,
                rating: 1500.00,
                rd: 350.00,
                volatility: 0.06000000,
                status: true,
                performance: 1450.202583
            },
            {
                id: 2,
                username: 'antiblunderchess',
                telegram_id: 5395535292,
                rating: 1500.00,
                rd: 350.00,
                volatility: 0.06000000,
                status: true,
                performance: 1325.891841
            },
            {
                id: 3,
                username: 'test_user',
                telegram_id: null,
                rating: 1500.00,
                rd: 350.00,
                volatility: 0.06000000,
                status: true,
                performance: 1500.00
            }
        ];

        // Вставляем всех пользователей
        for (const user of users) {
            await pool.query(
                `INSERT INTO Users (id, username, telegram_id, rating, rd, volatility, status) 
                 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [
                    user.id,
                    user.username,
                    user.telegram_id,
                    user.rating,
                    user.rd,
                    user.volatility,
                    user.status
                ]
            );
        }
        
        // Сбрасываем последовательность id
        await pool.query('SELECT setval(\'users_id_seq\', (SELECT MAX(id) FROM Users))');
        
        console.log('Users initialized successfully');
    } catch (err) {
        console.error('Error initializing users:', err);
        throw err;
    }
}

// Обновляем функцию для инициализации настроек
async function initializeSettings() {
    try {
        // Очищаем существующие настройки
        await pool.query('DELETE FROM Settings');
        
        // Добавляем новые настройки
        const settings = [
            { id: 1, setting: 'Period, days', meaning: 5 },
            { id: 2, setting: 'Минимальное количество задач для расчета перформанса', meaning: 0 },
            { id: 3, setting: 'Минимальный перформанс для сравнения', meaning: 100 },
            { id: 4, setting: 'Коэффициент понижения базовой вероятности', meaning: 0.5 },
            { id: 5, setting: 'Норма решения 1 задачи, секунд', meaning: 30 },
            { id: 6, setting: 'Коэффициент, понижающий значение первого результата в сравнении с последним при расчете скользящего перформанса', meaning: 2 },
            { id: 7, setting: 'Базовая вероятность критерия "лучший"', meaning: 0.150 },
            { id: 8, setting: 'Базовая вероятность критерия "защита"', meaning: 0.350 },
            { id: 9, setting: 'Базовая вероятность критерия "обычный"', meaning: 0.500 },
            { id: 10, setting: 'Базовая вероятность критерия "пропуск"', meaning: 0.250 },
            { id: 11, setting: 'Базовая вероятность критерия "фейк"', meaning: 0.250 },
            { id: 12, setting: 'Базовая вероятность критерия "нет защиты"', meaning: 0.250 },
            { id: 13, setting: 'Базовая вероятность критерия "подстава"', meaning: 0.250 },
            { id: 14, setting: 'Базовая вероятность критерия "супер легкая"', meaning: 0.025 },
            { id: 15, setting: 'Базовая вероятность критерия "очень легкая"', meaning: 0.100 },
            { id: 16, setting: 'Базовая вероятность критерия "легкая"', meaning: 0.200 },
            { id: 17, setting: 'Базовая вероятность критерия "средняя"', meaning: 0.350 },
            { id: 18, setting: 'Базовая вероятность критерия "сложная"', meaning: 0.200 },
            { id: 19, setting: 'Базовая вероятность критерия "очень сложная"', meaning: 0.100 },
            { id: 20, setting: 'Базовая вероятность критерия "супер сложная"', meaning: 0.025 },
            { id: 21, setting: 'Стандартное отклонение', meaning: 100 },
            { id: 22, setting: 'Время до предварительного хода, секунд', meaning: 1 },
            { id: 23, setting: 'Время анализа 1 линии, секунд', meaning: 1 },
            { id: 24, setting: 'Количество задач в день, которое может решать активный пользователь', meaning: 100 },
            { id: 25, setting: 'Количество задач в день, которое может решать неактивный пользователь', meaning: 3 }
        ];

        // Вставляем все настройки
        for (const setting of settings) {
            await pool.query(
                'INSERT INTO Settings (id, setting, meaning) VALUES ($1, $2, $3)',
                [setting.id, setting.setting, setting.meaning]
            );
        }
        
        console.log('Settings initialized successfully');
    } catch (err) {
        console.error('Error initializing settings:', err);
        throw err;
    }
}

// Обновляем функцию для инициализации журнала
async function initializeJournal() {
    try {
        // Очищаем существующие записи
        await pool.query('DELETE FROM Journal');
        
        // Сбрасываем последовательность
        await pool.query('ALTER SEQUENCE journal_id_seq RESTART WITH 1');
        
        // Добавляем записи из таблицы
        const journal = [
            {
                id: 1,
                user_id: 2,
                puzzle_id: 3,
                success: true,
                time_success: 15.2,
                puzzle_rating_before: 1500.0000,
                user_rating_after: null,
                complexity_id: 2,
                date: '2025-03-01 10:00:00'
            },
            {
                id: 2,
                user_id: 1,
                puzzle_id: 2,
                success: true,
                time_success: 10.8,
                puzzle_rating_before: 1400.0000,
                user_rating_after: null,
                complexity_id: 4,
                date: '2025-03-02 10:00:00'
            },
            {
                id: 3,
                user_id: 3,
                puzzle_id: 6,
                success: false,
                time_success: 16.8,
                puzzle_rating_before: 1520.0000,
                user_rating_after: null,
                complexity_id: 4,
                date: '2025-03-02 11:00:00'
            },
            {
                id: 4,
                user_id: 2,
                puzzle_id: 1,
                success: true,
                time_success: 70.4,
                puzzle_rating_before: 1520.0000,
                user_rating_after: null,
                complexity_id: 4,
                date: '2025-03-01 10:00:00'
            },
            {
                id: 5,
                user_id: 1,
                puzzle_id: 5,
                success: true,
                time_success: 1.2,
                puzzle_rating_before: 1520.0000,
                user_rating_after: null,
                complexity_id: 1,
                date: '2025-03-01 11:00:00'
            },
            {
                id: 6,
                user_id: 2,
                puzzle_id: 15,
                success: true,
                time_success: 8.4,
                puzzle_rating_before: 1520.0000,
                user_rating_after: null,
                complexity_id: 4,
                date: '2025-03-01 10:00:00'
            },
            {
                id: 7,
                user_id: 2,
                puzzle_id: 13,
                success: false,
                time_success: 180.0,
                puzzle_rating_before: 1520.0000,
                user_rating_after: null,
                complexity_id: 4,
                date: '2025-03-02 12:00:00'
            },
            {
                id: 8,
                user_id: 3,
                puzzle_id: 12,
                success: true,
                time_success: 102.7,
                puzzle_rating_before: 1520.0000,
                user_rating_after: null,
                complexity_id: 4,
                date: '2025-03-03 10:00:00'
            },
            {
                id: 9,
                user_id: 1,
                puzzle_id: 8,
                success: true,
                time_success: 4.2,
                puzzle_rating_before: 1520.0000,
                user_rating_after: null,
                complexity_id: 3,
                date: '2025-03-03 11:00:00'
            },
            {
                id: 10,
                user_id: 3,
                puzzle_id: 9,
                success: false,
                time_success: 17.8,
                puzzle_rating_before: 1520.0000,
                user_rating_after: null,
                complexity_id: 4,
                date: '2025-03-05 10:00:00'
            },
            {
                id: 11,
                user_id: 1,
                puzzle_id: 9,
                success: false,
                time_success: 67.9,
                puzzle_rating_before: 1520.0000,
                user_rating_after: null,
                complexity_id: 3,
                date: '2025-03-05 12:00:00'
            },
            {
                id: 12,
                user_id: 2,
                puzzle_id: 6,
                success: false,
                time_success: 15.7,
                puzzle_rating_before: 1520.0000,
                user_rating_after: null,
                complexity_id: 4,
                date: '2025-03-05 11:00:00'
            },
            {
                id: 13,
                user_id: 1,
                puzzle_id: 7,
                success: false,
                time_success: 22.8,
                puzzle_rating_before: 1520.0000,
                user_rating_after: null,
                complexity_id: 4,
                date: '2025-03-06 10:00:00'
            },
            {
                id: 14,
                user_id: 2,
                puzzle_id: 4,
                success: false,
                time_success: 45.6,
                puzzle_rating_before: 1520.0000,
                user_rating_after: null,
                complexity_id: 5,
                date: '2025-03-06 12:00:00'
            },
            {
                id: 15,
                user_id: 1,
                puzzle_id: 10,
                success: false,
                time_success: 30.2,
                puzzle_rating_before: 1520.0000,
                user_rating_after: null,
                complexity_id: 6,
                date: '2025-03-06 11:05:00'
            },
            {
                id: 16,
                user_id: 1,
                puzzle_id: 15,
                success: true,
                time_success: 50.1,
                puzzle_rating_before: 1520.0000,
                user_rating_after: null,
                complexity_id: 4,
                date: '2025-03-06 10:00:00'
            },
            {
                id: 17,
                user_id: 2,
                puzzle_id: 2,
                success: true,
                time_success: 170.0,
                puzzle_rating_before: 1520.0000,
                user_rating_after: null,
                complexity_id: 4,
                date: '2025-03-06 11:00:00'
            },
            {
                id: 18,
                user_id: 2,
                puzzle_id: 9,
                success: true,
                time_success: 30.4,
                puzzle_rating_before: 1520.0000,
                user_rating_after: null,
                complexity_id: 4,
                date: '2025-03-06 18:00:00'
            },
            {
                id: 19,
                user_id: 2,
                puzzle_id: 12,
                success: true,
                time_success: 159.7,
                puzzle_rating_before: 1520.0000,
                user_rating_after: null,
                complexity_id: 4,
                date: '2025-03-07 11:00:00'
            },
            {
                id: 20,
                user_id: 2,
                puzzle_id: 10,
                success: true,
                time_success: 18.1,
                puzzle_rating_before: 1520.0000,
                user_rating_after: null,
                complexity_id: 3,
                date: '2025-03-07 10:00:00'
            }
        ];

        // Вставляем все записи
        for (const record of journal) {
            await pool.query(
                `INSERT INTO Journal (
                    id, user_id, puzzle_id, success, time_success,
                    puzzle_rating_before, user_rating_after, complexity_id, date
                ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [
                    record.id,
                    record.user_id,
                    record.puzzle_id,
                    record.success,
                    record.time_success,
                    record.puzzle_rating_before,
                    record.user_rating_after,
                    record.complexity_id,
                    record.date
                ]
            );
        }
        
        // Сбрасываем последовательность id
        await pool.query('SELECT setval(\'journal_id_seq\', (SELECT MAX(id) FROM Journal))');
        
        console.log('Journal initialized successfully');
    } catch (err) {
        console.error('Error initializing journal:', err);
        throw err;
    }
}

// Обновляем функцию для инициализации тегов
async function initializeTags() {
    try {
        // Очищаем существующие теги
        await pool.query('DELETE FROM Tags');
        
        // Сбрасываем последовательность
        await pool.query('ALTER SEQUENCE tags_id_seq RESTART WITH 1');
        
        // Добавляем теги из таблицы
        const tags = [
            { id: 1, tag: 'бесплатное взятие' },
            { id: 2, tag: 'выгодный размен' },
            { id: 3, tag: 'анализ' },
            { id: 4, tag: 'связка' },
            { id: 5, tag: 'вилка' },
            { id: 6, tag: 'рентген' },
            { id: 7, tag: 'вскрытое нападение' },
            { id: 8, tag: 'капкан' },
            { id: 9, tag: 'мат' },
            { id: 10, tag: 'последняя горизонталь' },
            { id: 11, tag: 'уничтожение защитника' },
            { id: 12, tag: 'отвлечение' },
            { id: 13, tag: 'перекрытие' },
            { id: 14, tag: 'завлечение' },
            { id: 15, tag: 'освобождение' },
            { id: 16, tag: 'превращение пешки' },
            { id: 17, tag: 'пат' },
            { id: 18, tag: 'повторение' }
        ];

        // Вставляем все теги
        for (const tag of tags) {
            await pool.query(
                'INSERT INTO Tags (id, tag) VALUES ($1, $2)',
                [tag.id, tag.tag]
            );
        }
        
        // Сбрасываем последовательность id
        await pool.query('SELECT setval(\'tags_id_seq\', (SELECT MAX(id) FROM Tags))');
        
        console.log('Tags initialized successfully');
    } catch (err) {
        console.error('Error initializing tags:', err);
        throw err;
    }
}

// Обновляем функцию для инициализации типов
async function initializeTypes() {
    try {
        // Очищаем существующие типы
        await pool.query('DELETE FROM Types');
        
        // Сбрасываем последовательность
        await pool.query('ALTER SEQUENCE types_id_seq RESTART WITH 1');
        
        // Добавляем типы из таблицы
        const types = [
            { id: 1, type: 'лучший' },
            { id: 2, type: 'защита' },
            { id: 3, type: 'обычный' },
            { id: 4, type: 'пропуск' },
            { id: 5, type: 'фейк' },
            { id: 6, type: 'нет защиты' },
            { id: 7, type: 'подстава' }
        ];

        // Вставляем все типы
        for (const type of types) {
            await pool.query(
                'INSERT INTO Types (id, type) VALUES ($1, $2)',
                [type.id, type.type]
            );
        }
        
        // Сбрасываем последовательность id
        await pool.query('SELECT setval(\'types_id_seq\', (SELECT MAX(id) FROM Types))');
        
        console.log('Types initialized successfully');
    } catch (err) {
        console.error('Error initializing types:', err);
        throw err;
    }
}

// Обновляем функцию для инициализации типов сложности
async function initializeComplexity() {
    try {
        // Очищаем существующие типы сложности
        await pool.query('DELETE FROM Complexity');
        
        // Сбрасываем последовательность
        await pool.query('ALTER SEQUENCE complexity_id_seq RESTART WITH 1');
        
        // Добавляем типы сложности из таблицы
        const complexityTypes = [
            { id: 1, complexity_type: 'супер легкая' },
            { id: 2, complexity_type: 'очень легкая' },
            { id: 3, complexity_type: 'легкая' },
            { id: 4, complexity_type: 'средняя' },
            { id: 5, complexity_type: 'сложная' },
            { id: 6, complexity_type: 'очень сложная' },
            { id: 7, complexity_type: 'супер сложная' }
        ];

        // Вставляем все типы сложности
        for (const complexity of complexityTypes) {
            await pool.query(
                'INSERT INTO Complexity (id, complexity_type) VALUES ($1, $2)',
                [complexity.id, complexity.complexity_type]
            );
        }
        
        // Сбрасываем последовательность id
        await pool.query('SELECT setval(\'complexity_id_seq\', (SELECT MAX(id) FROM Complexity))');
        
        console.log('Complexity types initialized successfully');
    } catch (err) {
        console.error('Error initializing complexity types:', err);
        throw err;
    }
}

// Обновляем функцию для инициализации связей задач с тегами
async function initializePuzzlesTags() {
    try {
        // Очищаем существующие связи
        await pool.query('DELETE FROM Puzzles_Tags');
        
        // Сбрасываем последовательность
        await pool.query('ALTER SEQUENCE puzzles_tags_id_seq RESTART WITH 1');
        
        // Добавляем связи из таблицы
        const puzzlesTags = [
            { id: 1, puzzle_id: 1, tag_id: 9 },
            { id: 2, puzzle_id: 2, tag_id: 4 },
            { id: 3, puzzle_id: 2, tag_id: 2 },
            { id: 4, puzzle_id: 3, tag_id: 2 },
            { id: 5, puzzle_id: 3, tag_id: 7 },
            { id: 6, puzzle_id: 4, tag_id: 3 },
            { id: 7, puzzle_id: 4, tag_id: 5 },
            { id: 8, puzzle_id: 4, tag_id: 7 },
            { id: 9, puzzle_id: 4, tag_id: 15 },
            { id: 10, puzzle_id: 5, tag_id: 1 },
            { id: 11, puzzle_id: 5, tag_id: 3 },
            { id: 12, puzzle_id: 6, tag_id: 17 },
            { id: 13, puzzle_id: 6, tag_id: 13 },
            { id: 14, puzzle_id: 7, tag_id: 7 },
            { id: 15, puzzle_id: 7, tag_id: 14 },
            { id: 16, puzzle_id: 8, tag_id: 7 },
            { id: 17, puzzle_id: 8, tag_id: 7 },
            { id: 18, puzzle_id: 8, tag_id: 6 },
            { id: 19, puzzle_id: 9, tag_id: 1 },
            { id: 20, puzzle_id: 9, tag_id: 7 },
            { id: 21, puzzle_id: 9, tag_id: 14 },
            { id: 22, puzzle_id: 9, tag_id: 3 },
            { id: 23, puzzle_id: 9, tag_id: 14 },
            { id: 24, puzzle_id: 10, tag_id: 7 },
            { id: 25, puzzle_id: 10, tag_id: 7 },
            { id: 26, puzzle_id: 10, tag_id: 14 },
            { id: 27, puzzle_id: 10, tag_id: 5 },
            { id: 28, puzzle_id: 11, tag_id: 1 },
            { id: 29, puzzle_id: 11, tag_id: 16 },
            { id: 30, puzzle_id: 12, tag_id: 1 },
            { id: 31, puzzle_id: 12, tag_id: 16 },
            { id: 32, puzzle_id: 13, tag_id: 14 },
            { id: 33, puzzle_id: 13, tag_id: 5 },
            { id: 34, puzzle_id: 14, tag_id: 4 },
            { id: 35, puzzle_id: 14, tag_id: 12 },
            { id: 36, puzzle_id: 15, tag_id: 12 },
            { id: 37, puzzle_id: 15, tag_id: 9 }
        ];

        // Вставляем все связи
        for (const puzzleTag of puzzlesTags) {
            await pool.query(
                'INSERT INTO Puzzles_Tags (id, puzzle_id, tag_id) VALUES ($1, $2, $3)',
                [puzzleTag.id, puzzleTag.puzzle_id, puzzleTag.tag_id]
            );
        }
        
        // Сбрасываем последовательность id
        await pool.query('SELECT setval(\'puzzles_tags_id_seq\', (SELECT MAX(id) FROM Puzzles_Tags))');
        
        console.log('Puzzles-Tags relations initialized successfully');
    } catch (err) {
        console.error('Error initializing puzzles-tags relations:', err);
        throw err;
    }
}
