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
        // Удаляем существующие таблицы
        await client.query(`
            DROP TABLE IF EXISTS Journal;
            DROP TABLE IF EXISTS Puzzles;
            DROP TABLE IF EXISTS Users;
            DROP TABLE IF EXISTS Settings;
            DROP TABLE IF EXISTS PuzzleAttempts;
        `);

        // Создаем таблицы заново
        await client.query(`
            CREATE TABLE IF NOT EXISTS Users (
                username VARCHAR(255) PRIMARY KEY
            );
            
            CREATE TABLE IF NOT EXISTS Puzzles (
                id SERIAL PRIMARY KEY,
                rating FLOAT DEFAULT 1500,
                rd FLOAT DEFAULT 350,
                volatility FLOAT DEFAULT 0.06,
                fen TEXT NOT NULL,
                move_1 VARCHAR(10),
                move_2 VARCHAR(10),
                solution VARCHAR(10),
                type VARCHAR(50),
                color CHAR(1),
                difficulty VARCHAR(20)
            );
            
            CREATE TABLE IF NOT EXISTS Journal (
                id SERIAL PRIMARY KEY,
                username VARCHAR(255),
                puzzle_id INT,
                success BOOLEAN,
                time INT,
                rating FLOAT,
                rd FLOAT,
                volatility FLOAT,
                date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            
            CREATE TABLE IF NOT EXISTS Settings (
                parameter_name VARCHAR(50) PRIMARY KEY,
                parameter_value FLOAT
            );

            CREATE TABLE IF NOT EXISTS PuzzleAttempts (
                id SERIAL PRIMARY KEY,
                username VARCHAR(255),
                puzzle_fen TEXT,
                attempted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                success BOOLEAN,
                UNIQUE(username, puzzle_fen)
            );
        `);

        // Добавляем тестового пользователя
        await client.query(`
            INSERT INTO Users (username)
            VALUES ('test_user')
            ON CONFLICT (username) DO NOTHING;
        `);

        // Добавляем таблицу SolvedPuzzles
        await client.query(`
            CREATE TABLE IF NOT EXISTS SolvedPuzzles (
                id SERIAL PRIMARY KEY,
                username VARCHAR(255),
                puzzle_fen TEXT,
                solved_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(username, puzzle_fen)
            );
        `);

    } catch (err) {
        console.error('Error creating tables:', err);
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

// Переносим все задачи в generatePuzzlesList
function generatePuzzlesList() {
    return [
        {
            fen: 'r1b2rk1/pp3ppp/2n2q2/2b5/8/2N2NP1/PP2PPBP/R2Q1RK1 w - - 0 1',
            move_1: 'f3e5',
            move_2: 'f6e5',
            solution: 'Good',
            type: 'Double Attack',
            difficulty: 'medium'
        },
        {
            fen: 'r4rk1/ppp2ppp/3p4/4n3/2P1R3/2P5/P4PPP/R5K1 w - - 0 1',
            move_1: 'e4e5',
            move_2: 'd6e5',
            solution: 'Blunder',
            type: 'Rook Defense',
            difficulty: 'medium'
        },
        {
            fen: 'r2qr1k1/pbp2ppp/1p6/3P4/4n3/2N3P1/PP3PBP/R2Q1RK1 b - - 0 1',
            move_1: 'e4f2',
            move_2: 'g1f2',
            solution: 'Good',
            type: 'Knight Sacrifice',
            difficulty: 'hard'
        },
        {
            fen: '2r3k1/p4ppp/1p2p3/3r4/8/2R2P2/PP4PP/2R3K1 w - - 0 1',
            move_1: 'c3c8',
            move_2: 'r8c8',
            solution: 'Good',
            type: 'Rook Exchange',
            difficulty: 'easy'
        },
        {
            fen: 'r2q1rk1/ppp2ppp/2np4/2b1p3/2B1P3/2PP1N2/PP3PPP/R2QK2R w KQ - 0 1',
            move_1: 'f3e5',
            move_2: 'd6e5',
            solution: 'Blunder',
            type: 'Knight Fork',
            difficulty: 'medium'
        },
        // Добавляем новые задачи
        {
            fen: 'r3r1k1/pp3ppp/2p5/3n4/8/2N2P2/PP4PP/R4RK1 w - - 0 1',
            move_1: 'c3d5',
            move_2: 'c6d5',
            solution: 'Good',
            difficulty: 'medium'
        },
        {
            fen: 'r2q1rk1/ppp2ppp/3b4/3P4/8/2N5/PP3PPP/R2Q1RK1 b - - 0 1',
            move_1: 'd6f4',
            move_2: 'd1d4',
            solution: 'Blunder',
            difficulty: 'medium'
        },
        {
            fen: 'r4rk1/ppp2ppp/8/4P3/1b6/2N5/PP3PPP/R3K2R w KQ - 0 1',
            move_1: 'c3d5',
            move_2: 'b4d2',
            solution: 'Blunder',
            difficulty: 'medium'
        },
        {
            fen: '3r2k1/pp3pp1/2p4p/8/3P4/2P2N2/PP3PPP/3R2K1 w - - 0 1',
            move_1: 'f3e5',
            move_2: 'd8d5',
            solution: 'Good',
            difficulty: 'easy'
        },
        {
            fen: 'r1b2rk1/pp3ppp/2n5/3q4/8/2N5/PP2QPPP/R4RK1 w - - 0 1',
            move_1: 'c3e4',
            move_2: 'd5e4',
            solution: 'Good',
            difficulty: 'medium'
        },
        {
            fen: 'r2q1rk1/1pp2ppp/p1nb1n2/4p3/4P3/1BN2N2/PPP2PPP/R2Q1RK1 w - - 0 1',
            move_1: 'b3e6',
            move_2: 'd6e5',
            solution: 'Good',
            difficulty: 'medium'
        },
        {
            fen: 'r4rk1/pp3ppp/2p5/2b1n3/8/2N2P2/PPP3PP/R3K2R w KQ - 0 1',
            move_1: 'c3e4',
            move_2: 'c5e3',
            solution: 'Blunder',
            difficulty: 'medium'
        },
        {
            fen: 'r1b2rk1/pp3ppp/2n1pn2/q7/3P4/2N1BN2/PP3PPP/R2Q1RK1 w - - 0 1',
            move_1: 'c3d5',
            move_2: 'e6d5',
            solution: 'Good',
            difficulty: 'hard'
        },
        {
            fen: '2r3k1/pp3ppp/4p3/4N3/8/8/PP3PPP/3R2K1 w - - 0 1',
            move_1: 'e5f7',
            move_2: 'g8f7',
            solution: 'Good',
            difficulty: 'easy'
        },
        {
            fen: 'r3k2r/ppp2ppp/2n5/3q4/8/2N5/PPP2PPP/R3K2R w KQkq - 0 1',
            move_1: 'c3e4',
            move_2: 'd5d1',
            solution: 'Blunder',
            difficulty: 'medium'
        },
        {
            fen: 'r1bqk2r/ppp2ppp/2n5/3n4/8/2N5/PPP1BPPP/R2QK2R w KQkq - 0 1',
            move_1: 'c3d5',
            move_2: 'c6e7',
            solution: 'Blunder',
            difficulty: 'hard'
        },
        {
            fen: 'r4rk1/ppp2ppp/3p4/4n3/8/2N5/PPP2PPP/2KR3R w - - 0 1',
            move_1: 'c3e4',
            move_2: 'e5c4',
            solution: 'Good',
            difficulty: 'medium'
        },
        {
            fen: 'r2qkb1r/ppp2ppp/2n5/3p4/3P4/2N2N2/PPP2PPP/R1BQK2R w KQkq - 0 1',
            move_1: 'f3e5',
            move_2: 'c6e5',
            solution: 'Good',
            difficulty: 'medium'
        },
        {
            fen: 'r1b1k2r/pppp1ppp/2n2n2/8/1b6/2N2N2/PPP2PPP/R1B1KB1R w KQkq - 0 1',
            move_1: 'c3d5',
            move_2: 'f6d5',
            solution: 'Good',
            difficulty: 'hard'
        },
        {
            fen: 'r3kb1r/ppp2ppp/2n5/3q4/8/2N5/PPP2PPP/R1B1K2R w KQkq - 0 1',
            move_1: 'c3e4',
            move_2: 'd5e4',
            solution: 'Good',
            difficulty: 'easy'
        },
        {
            fen: 'r1b2rk1/pp2nppp/2p5/3p4/3P4/2N1BN2/PP3PPP/3R1RK1 w - - 0 1',
            move_1: 'c3d5',
            move_2: 'c6d5',
            solution: 'Good',
            difficulty: 'hard'
        },
        {
            fen: 'r4rk1/pp2qppp/2p5/3p4/3P4/2P2N2/PP1Q1PPP/R4RK1 w - - 0 1',
            move_1: 'f3e5',
            move_2: 'e7e5',
            solution: 'Blunder',
            difficulty: 'hard'
        },
        {
            fen: 'r1bq1rk1/pp3ppp/2n5/2b5/8/2N2N2/PP2BPPP/R2Q1RK1 w - - 0 1',
            move_1: 'c3d5',
            move_2: 'c6d4',
            solution: 'Good',
            difficulty: 'hard'
        },
        {
            fen: 'r3k2r/ppp2ppp/2n5/3p4/8/2N2N2/PP2BPPP/R4RK1 b kq - 0 1',
            move_1: 'd5f3',
            move_2: 'e2f3',
            solution: 'Good',
            difficulty: 'hard'
        },
        {
            fen: 'r1b2rk1/ppp1qppp/2n5/3p4/8/2N2N2/PP2BPPP/R2Q1RK1 w - - 0 1',
            move_1: 'c3d5',
            move_2: 'e7e2',
            solution: 'Blunder',
            difficulty: 'hard'
        },
        {
            fen: 'r4rk1/pp2bppp/2p5/3p4/3P4/2N1BN2/PP3PPP/R4RK1 w - - 0 1',
            move_1: 'f3e5',
            move_2: 'e7c5',
            solution: 'Good',
            difficulty: 'medium'
        },
        {
            fen: 'r1bqk2r/ppp2ppp/2n5/3p4/2B5/2N2N2/PP2QPPP/R4RK1 w kq - 0 1',
            move_1: 'c4d5',
            move_2: 'c6e5',
            solution: 'Good',
            difficulty: 'hard'
        },
        {
            fen: 'r3k2r/pp3ppp/2n5/3p4/8/2N2N2/PP2BPPP/R4RK1 b kq - 0 1',
            move_1: 'c6e5',
            move_2: 'f3e5',
            solution: 'Blunder',
            difficulty: 'hard'
        },
        {
            fen: 'r1b2rk1/pp3ppp/2n2q2/3p4/8/2N2N2/PP2BPPP/R2Q1RK1 w - - 0 1',
            move_1: 'c3e4',
            move_2: 'f6e6',
            solution: 'Good',
            difficulty: 'hard'
        },
        {
            fen: 'r4rk1/pp2bppp/2n5/3p4/8/2N2N2/PP2BPPP/R2Q1RK1 w - - 0 1',
            move_1: 'c3d5',
            move_2: 'c6d4',
            solution: 'Good',
            difficulty: 'hard'
        },
        {
            fen: 'r1bq1rk1/ppp2ppp/2n5/3p4/3P4/2N2N2/PP2BPPP/R2QK2R w KQ - 0 1',
            move_1: 'c3d5',
            move_2: 'c6d4',
            solution: 'Blunder',
            difficulty: 'medium'
        },
        {
            fen: 'r2qk2r/ppp2ppp/2n5/3p4/3P4/2N2N2/PP2BPPP/R2Q1RK1 b kq - 0 1',
            move_1: 'f3d2',
            move_2: 'd5d4',
            solution: 'Blunder',
            difficulty: 'hard'
        },
        {
            fen: 'r1bqk2r/ppp2ppp/2n5/3p4/3P4/2N2N2/PP2BPPP/R2QK2R b KQkq - 0 1',
            move_1: 'c6d4',
            move_2: 'c3d5',
            solution: 'Blunder',
            difficulty: 'medium'
        },
        {
            fen: 'r3k2r/ppp2ppp/2n5/3p4/3P4/2N2N2/PP2BPPP/R2QK2R b KQkq - 0 1',
            move_1: 'd5d4',
            move_2: 'c3e4',
            solution: 'Blunder',
            difficulty: 'hard'
        },
        {
            fen: 'r2qk2r/ppp2ppp/2n5/3p4/3P4/2N2N2/PP2BPPP/R2Q1RK1 b kq - 0 1',
            move_1: 'c6e5',
            move_2: 'f3e5',
            solution: 'Blunder',
            difficulty: 'medium'
        },
        {
            fen: 'r1bqk2r/ppp2ppp/2n5/3p4/3P4/2N2N2/PP2BPPP/R2QK2R w KQkq - 0 1',
            move_1: 'f3d2',
            move_2: 'd5d4',
            solution: 'Blunder',
            difficulty: 'hard'
        },
        {
            fen: 'r1bq1rk1/ppp2ppp/2n5/3p4/8/2N2N2/PP2BPPP/R2QK2R w KQ - 0 1',
            move_1: 'f3d4',
            move_2: 'c6e5',
            solution: 'Blunder',
            difficulty: 'easy'
        },
        {
            fen: 'r3k2r/pp3ppp/2n5/3p4/8/2N2N2/PP2BPPP/R2QK2R b kq - 0 1',
            move_1: 'c6e5',
            move_2: 'f3e5',
            solution: 'Blunder',
            difficulty: 'hard'
        },
        {
            fen: 'r2q1rk1/ppp2ppp/8/3p4/3P4/4P3/PP3PPP/R2QK2R b KQ - 0 1',
            move_1: 'd8d6',
            move_2: 'd1d3',
            solution: 'Good',
            difficulty: 'easy'
        },
        {
            fen: 'r1bqk2r/ppp2ppp/2n5/3p4/8/2N2N2/PP2BPPP/R2Q1RK1 w kq - 0 1',
            move_1: 'c3d5',
            move_2: 'c6d4',
            solution: 'Blunder',
            difficulty: 'hard'
        },
        {
            fen: 'r3k2r/pp3ppp/2n5/3p4/8/2N5/PP2BPPP/R3K2R w KQ - 0 1',
            move_1: 'e2c4',
            move_2: 'd5c4',
            solution: 'Blunder',
            difficulty: 'medium'
        },
        {
            fen: 'r2qkb1r/ppp2ppp/2n5/3p4/8/2N2N2/PP2BPPP/R2QK2R b KQkq - 0 1',
            move_1: 'c6d4',
            move_2: 'c3d5',
            solution: 'Blunder',
            difficulty: 'easy'
        },
        {
            fen: 'r1b1k2r/ppp2ppp/2n5/3q4/8/2N2N2/PP2BPPP/R2Q1RK1 w kq - 0 1',
            move_1: 'f3e5',
            move_2: 'd5e5',
            solution: 'Good',
            difficulty: 'hard'
        },
        {
            fen: 'r3k2r/pp3ppp/2n5/3p4/8/2N2N2/PP2BPPP/R3K2R b KQkq - 0 1',
            move_1: 'c6e5',
            move_2: 'f3d4',
            solution: 'Blunder',
            difficulty: 'medium'
        },
        {
            fen: 'r2qk2r/ppp2ppp/2n5/3p4/8/2N2N2/PP2BPPP/R2Q1RK1 w kq - 0 1',
            move_1: 'f3e5',
            move_2: 'c6e5',
            solution: 'Good',
            difficulty: 'easy'
        },
        {
            fen: 'r1bqk2r/ppp2ppp/2n5/3p4/8/2N2N2/PP2BPPP/R2QK2R w KQkq - 0 1',
            move_1: 'c3e4',
            move_2: 'd5e4',
            solution: 'Blunder',
            difficulty: 'hard'
        },
        {
            fen: 'r3k2r/pp3ppp/8/3pn3/8/2N2N2/PP2BPPP/R4RK1 w kq - 1 2',
            move_1: 'f3e5',
            move_2: 'd5e5',
            solution: 'Good',
            difficulty: 'medium'
        }
    ];
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

// Функция для получения нерешенных задач (обновленная)
async function getUnsolvedPuzzles(username) {
    try {
        // Получаем все FEN-позиции, которые пользователь уже пытался решить
        const attemptedResult = await pool.query(
            'SELECT puzzle_fen FROM PuzzleAttempts WHERE username = $1',
            [username]
        );
        const attemptedFens = attemptedResult.rows.map(row => row.puzzle_fen);

        // Получаем все доступные задачи
        const puzzles = generatePuzzlesList();
        
        // Фильтруем только те задачи, которые пользователь еще не пытался решить
        const unsolvedPuzzles = puzzles.filter(puzzle => !attemptedFens.includes(puzzle.fen));
        
        // Разделяем задачи на Good и Blunder
        const goodPuzzles = unsolvedPuzzles.filter(p => p.solution === 'Good');
        const blunderPuzzles = unsolvedPuzzles.filter(p => p.solution === 'Blunder');
        
        // Перемешиваем каждый массив отдельно
        for (let i = goodPuzzles.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [goodPuzzles[i], goodPuzzles[j]] = [goodPuzzles[j], goodPuzzles[i]];
        }
        
        for (let i = blunderPuzzles.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [blunderPuzzles[i], blunderPuzzles[j]] = [blunderPuzzles[j], blunderPuzzles[i]];
        }
        
        // Чередуем Good и Blunder задачи
        const result = [];
        const maxLength = Math.max(goodPuzzles.length, blunderPuzzles.length);
        
        for (let i = 0; i < maxLength; i++) {
            // Добавляем случайным образом Good или Blunder
            if (Math.random() < 0.5) {
                if (i < goodPuzzles.length) result.push(goodPuzzles[i]);
                if (i < blunderPuzzles.length) result.push(blunderPuzzles[i]);
            } else {
                if (i < blunderPuzzles.length) result.push(blunderPuzzles[i]);
                if (i < goodPuzzles.length) result.push(goodPuzzles[i]);
            }
        }
        
        return result;
    } catch (err) {
        console.error('Error getting unsolved puzzles:', err);
        throw err;
    }
}

// Обновляем findPuzzleForUser
async function findPuzzleForUser(username) {
    try {
        // Получаем список нерешенных задач (уже перемешанный)
        const unsolvedPuzzles = await getUnsolvedPuzzles(username);

        // Если нет нерешенных задач
        if (unsolvedPuzzles.length === 0) {
            throw new Error('Все задачи решены! Поздравляем!');
        }

        // Берем первую задачу из перемешанного списка
        const position = unsolvedPuzzles[0];
        position.color = position.fen.includes(' w ') ? 'W' : 'B';

        // Сохраняем задачу в базу
        const result = await pool.query(
            `INSERT INTO Puzzles 
            (rating, rd, volatility, fen, move_1, move_2, solution, type, color, difficulty)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            RETURNING *`,
            [1500, 350.0, 0.06, position.fen, position.move_1, position.move_2,
             position.solution, position.type, position.color, position.difficulty]
        );

        return result.rows[0];
    } catch (err) {
        console.error('Error finding puzzle:', err);
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
        // Получаем последнюю запись рейтинга пользователя
        const result = await pool.query(
            `SELECT rating, rd, volatility 
            FROM Journal 
            WHERE username = $1 
            ORDER BY date DESC 
            LIMIT 1`,
            [username]
        );

        // Если записей нет - инициализируем рейтинг
        if (result.rows.length === 0) {
            return await initializeUserRating(username);
        }

        return result.rows[0];
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
    try {
        const userRating = await getUserRating(username);
        const puzzleRating = await getPuzzleRating(puzzleId);
        
        // Рассчитываем новый рейтинг
        const newRatings = calculateNewRatings(userRating, puzzleRating, success ? 1 : 0);
        
        // Записываем результат
        const result = await pool.query(
            `INSERT INTO Journal 
            (username, puzzle_id, success, time, rating, rd, volatility)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING rating, rd, volatility`,
            [
                username,
                puzzleId,
                success,
                time,
                newRatings.userRating,
                newRatings.userRD,
                newRatings.userVolatility
            ]
        );

        return result.rows[0];
    } catch (err) {
        console.error('Error recording solution:', err);
        throw err;
    }
}

// Функция для расчета новых рейтингов
function calculateNewRatings(userRating, puzzleRating, R) {
    // Константы
    const q = Math.log(10) / 400; // = 0.00575646273
    const c = 34.6;  // Константа для изменения RD со временем
    
    // Шаг 1: Определение отклонения рейтинга (RD)
    const RD = Math.min(Math.sqrt(userRating.rd * userRating.rd + c * c), 350);
    
    // Шаг 2: Определение нового рейтинга
    const g = 1 / Math.sqrt(1 + 3 * q * q * puzzleRating.rd * puzzleRating.rd / (Math.PI * Math.PI));
    const E = 1 / (1 + Math.pow(10, g * (userRating.rating - puzzleRating.rating) / -400));
    const d2 = 1 / (q * q * g * g * E * (1 - E));
    
    // Ограничиваем максимальное изменение рейтинга
    const maxRatingChange = 32;
    const ratingChange = (q / (1 / (RD * RD) + 1 / d2)) * g * (R - E);
    const limitedRatingChange = Math.max(Math.min(ratingChange, maxRatingChange), -maxRatingChange);
    
    // Новый рейтинг с ограничением
    const newRating = userRating.rating + limitedRatingChange;
    
    // Шаг 3: Определение нового отклонения рейтинга
    const newRD = Math.sqrt(1 / (1 / (RD * RD) + 1 / d2));
    
    return {
        userRating: newRating,
        userRD: newRD,
        userVolatility: userRating.volatility // Оставляем волатильность без изменений
    };
}

// API endpoints
app.get('/api/user-rating/:username', async (req, res) => {
    try {
        const result = await getUserRating(req.params.username);
        console.log('Returning user rating:', result);
        res.json(result);
    } catch (err) {
        console.error('Error getting user rating:', err);
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/check-access/:username', async (req, res) => {
    try {
        const result = await checkUserAccess(req.params.username);
        res.json({ hasAccess: result });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/random-puzzle/:username', async (req, res) => {
    try {
        const username = req.params.username;
        console.log('Generating puzzle for user:', username);
        
        const puzzle = await findPuzzleForUser(username);
        res.json(puzzle);
    } catch (err) {
        if (err.message === 'Все задачи решены! Поздравляем!') {
            res.status(404).json({ 
                error: err.message,
                type: 'ALL_SOLVED'
            });
        } else {
            console.error('Error in /api/random-puzzle:', err);
            res.status(500).json({ error: err.message });
        }
    }
});

app.post('/api/record-solution', async (req, res) => {
    const client = await pool.connect();
    try {
        const { username, puzzleId, success, time } = req.body;
        
        await client.query('BEGIN');
        
        // Получаем FEN задачи
        const puzzleResult = await client.query(
            'SELECT fen FROM Puzzles WHERE id = $1',
            [puzzleId]
        );
        
        if (!puzzleResult.rows[0]) {
            throw new Error('Puzzle not found');
        }

        // Записываем попытку решения
        await client.query(
            `INSERT INTO PuzzleAttempts (username, puzzle_fen, success) 
             VALUES ($1, $2, $3) 
             ON CONFLICT (username, puzzle_fen) DO UPDATE SET 
             success = $3, 
             attempted_at = CURRENT_TIMESTAMP`,
            [username, puzzleResult.rows[0].fen, success]
        );
        
        // Записываем результат решения
        const result = await recordPuzzleSolution(username, puzzleId, success, time);
        
        await client.query('COMMIT');
        
        res.json(result);
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error in /api/record-solution:', err);
        res.status(500).json({ 
            error: err.message,
            details: err.stack
        });
    } finally {
        client.release();
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
