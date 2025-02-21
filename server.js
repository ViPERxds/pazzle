const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const path = require('path');
const Chess = require('chess.js').Chess;
const app = express();
require('dotenv').config({
    path: process.env.NODE_ENV === 'production' 
        ? '.env'
        : '.env.development'
});

app.use(cors({
    origin: '*', // Разрешаем запросы с любого домена
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// Добавляем заголовки для всех ответов
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    next();
});

app.use(express.json());

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

// Проверяем подключение при запуске
pool.connect((err, client, release) => {
    if (err) {
        console.error('Error connecting to the database:', err);
        return;
    }
    console.log('Successfully connected to database');
    release();
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

const usedPuzzles = new Set();

// Функция для генерации случайной шахматной позиции
function generateRandomPuzzle() {
    // Набор шаблонов для разных типов задач
    const puzzleTemplates = [
        // Легкие задачи
        {
            fen: 'r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 0 1',
            move_1: 'h5f7',
            move_2: 'e8f7',
            solution: 'Good',
            type: 'Mate in 1',
            difficulty: 'easy'
        },
        {
            fen: '2rq1rk1/pb2bppp/1p2pn2/2p5/2P5/2N1P1B1/PP3PPP/R2QKB1R w KQ - 0 1',
            move_1: 'g3d6',
            move_2: 'c5d6',
            solution: 'Blunder',
            type: 'Pin',
            difficulty: 'easy'
        },
        // Средние задачи
        {
            fen: 'r4rk1/ppp2ppp/2n5/2bqp3/8/P1N5/1PP1QPPP/R1B2RK1 b - - 0 1',
            move_1: 'd5e4',
            move_2: 'c3e4',
            solution: 'Blunder',
            type: 'Fork',
            difficulty: 'medium'
        },
        {
            fen: 'r1b2rk1/2q1bppp/p2p1n2/np2p3/3PP3/2P2N2/PPB2PPP/R1BQR1K1 w - - 0 1',
            move_1: 'e4e5',
            move_2: 'd6e5',
            solution: 'Good',
            type: 'Attack',
            difficulty: 'medium'
        },
        // Сложные задачи
        {
            fen: 'r1b1k2r/ppppqppp/2n2n2/2b5/2B1P3/2N2N2/PPPP1PPP/R1BQ1RK1 w kq - 0 1',
            move_1: 'c4f7',
            move_2: 'e7f7',
            solution: 'Good',
            type: 'Sacrifice',
            difficulty: 'hard'
        },
        {
            fen: '2kr3r/ppp2ppp/2n5/1B1P4/4P1b1/2P1B3/P4PPP/R3K2R b KQ - 0 1',
            move_1: 'c6d5',
            move_2: 'e4d5',
            solution: 'Blunder',
            type: 'Trap',
            difficulty: 'hard'
        }
    ];

    // Если все позиции были использованы, очищаем историю
    if (usedPuzzles.size >= puzzleTemplates.length) {
        usedPuzzles.clear();
    }

    // Выбираем случайную неиспользованную позицию
    let position;
    do {
        position = puzzleTemplates[Math.floor(Math.random() * puzzleTemplates.length)];
    } while (usedPuzzles.has(position.fen));

    // Добавляем позицию в использованные
    usedPuzzles.add(position.fen);
    
    // Добавляем цвет в зависимости от того, чей ход
    position.color = position.fen.includes(' w ') ? 'w' : 'b';

    // Добавляем рейтинг в зависимости от сложности
    const ratings = {
        easy: [1000, 1400],
        medium: [1400, 1800],
        hard: [1800, 2200]
    };
    const [min, max] = ratings[position.difficulty];
    position.rating = Math.floor(Math.random() * (max - min)) + min;
    
    return position;
}

// Функция для поиска задачи для пользователя
async function findPuzzleForUser(username) {
    try {
        const position = generateRandomPuzzle();
        
        const result = await pool.query(
            `INSERT INTO Puzzles 
            (rating, rd, volatility, fen, move_1, move_2, solution, type, color, difficulty, puzzle_rating)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            RETURNING *`,
            [
                position.rating,
                350.0,
                0.06,
                position.fen,
                position.move_1,
                position.move_2,
                position.solution,
                position.type,
                position.color,
                position.difficulty,
                position.rating
            ]
        );

        console.log('Created new puzzle:', result.rows[0]);
        return result.rows[0];
    } catch (err) {
        console.error('Error finding puzzle:', err);
        throw err;
    }
}

// Функция для получения рейтинга пользователя
async function getUserRating(username) {
    try {
        const result = await pool.query(
            `SELECT rating, rd, volatility 
            FROM Journal 
            WHERE username = $1 
            ORDER BY date DESC 
            LIMIT 1`,
            [username]
        );
        
        if (result.rows.length === 0) {
            return {
                rating: 1500,
                rd: 350,
                volatility: 0.06
            };
        }
        
        return result.rows[0];
    } catch (err) {
        console.error('Error getting user rating:', err);
        return {
            rating: 1500,
            rd: 350,
            volatility: 0.06
        };
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

// Обновим обработчик для записи решения
app.post('/api/record-solution', async (req, res) => {
    try {
        const { username, success, time } = req.body;
        console.log('Recording solution:', { username, success, time });

        // Проверяем существование пользователя
        let userExists = await checkUserAccess(username);
        if (!userExists) {
            await pool.query('INSERT INTO Users (username) VALUES ($1)', [username]);
        }

        // Получаем текущий рейтинг пользователя
        const userRating = await getUserRating(username);
        
        // Записываем результат в журнал
        await pool.query(
            `INSERT INTO Journal 
            (username, success, time, rating, rd, volatility)
            VALUES ($1, $2, $3, $4, $5, $6)`,
            [
                username,
                success,
                time,
                userRating.rating,
                userRating.rd,
                userRating.volatility
            ]
        );

        // Обновляем рейтинг пользователя
        const newRating = success ? userRating.rating + 10 : userRating.rating - 5;
        
        // Записываем новый рейтинг
        await pool.query(
            `INSERT INTO Journal 
            (username, rating, rd, volatility)
            VALUES ($1, $2, $3, $4)`,
            [username, newRating, userRating.rd, userRating.volatility]
        );

        res.json({
            success: true,
            rating: newRating
        });

    } catch (err) {
        console.error('Error in /api/record-solution:', err);
        res.status(500).json({ 
            error: err.message,
            success: false,
            rating: 1500
        });
    }
});

// Добавляем обработку favicon.ico
app.get('/favicon.ico', (req, res) => {
    res.status(204).end();
});

// Добавляем раздачу статических файлов
app.use(express.static(path.join(__dirname)));

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

// Добавим в начало файла после настроек CORS
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
});

// API endpoints
app.get('/api/user-rating/:username', async (req, res) => {
    try {
        const username = req.params.username;
        console.log('Getting rating for:', username);
        
        // Проверяем существование пользователя
        let userExists = await checkUserAccess(username);
        if (!userExists) {
            // Создаем нового пользователя
            await pool.query('INSERT INTO Users (username) VALUES ($1)', [username]);
        }
        
        const rating = await getUserRating(username);
        res.json(rating);
    } catch (err) {
        console.error('Error in /api/user-rating:', err);
        res.status(500).json({ rating: 1500, error: err.message });
    }
});

app.get('/api/check-access/:username', async (req, res) => {
    try {
        const result = await checkUserAccess(req.params.username);
        res.json({ hasAccess: true }); // Временно разрешаем доступ всем
    } catch (err) {
        console.error('Error checking access:', err);
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/random-puzzle/:username', async (req, res) => {
    try {
        const puzzle = generateRandomPuzzle();
        console.log('Generated puzzle:', puzzle);
        res.json(puzzle);
    } catch (err) {
        console.error('Error generating puzzle:', err);
        res.status(500).json({ error: err.message });
    }
});

// Запускаем сервер
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
