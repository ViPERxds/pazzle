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
    origin: true, // Разрешаем запросы с того же домена
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
}));

// Добавим промежуточное ПО для предварительной проверки CORS
app.options('*', cors());

// Удалим дублирующие заголовки
app.use((req, res, next) => {
    res.header('Cache-Control', 'no-cache');
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
    const chess = new Chess();
    
    return {
        id: Date.now(), // Временный ID
        fen: chess.fen(),
        move_1: 'e2e4',  // Пример хода
        move_2: 'e7e5',  // Пример хода
        solution: 'd2d4', // Пример решения
        type: 'mate',
        color: 'w',
        difficulty: 'medium',
        rating: 1500
    };
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
            // Если это первый раз, создаем запись для пользователя
            await pool.query(
                `INSERT INTO Users (username) 
                VALUES ($1) 
                ON CONFLICT (username) DO NOTHING`,
                [username]
            );
            
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

// Функция для записи результата решения
async function recordPuzzleSolution(username, puzzleId, success, time) {
    try {
        console.log('Starting recordPuzzleSolution with:', { username, puzzleId, success, time });
        
        const settings = await getSettings();
        console.log('Settings:', settings);
        
        const normalTime = settings.normal_time || 60;
        const R = success * Math.exp(-1/normalTime * Math.log(2) * time);
        console.log('Calculated R with:', {
            success,
            time,
            normalTime,
            R
        });
        
        const userRating = await getUserRating(username);
        console.log('User rating:', userRating);
        
        const puzzleRating = await getPuzzleRating(puzzleId);
        console.log('Puzzle rating:', puzzleRating);
        
        if (!puzzleRating) {
            throw new Error(`Puzzle ${puzzleId} not found`);
        }
        
        const newRatings = calculateNewRatings(userRating, puzzleRating, R);
        console.log('New ratings calculated:', newRatings);
        
        // Добавляем проверку на null/undefined
        if (!newRatings || !newRatings.userRating || !newRatings.userRD || !newRatings.userVolatility) {
            throw new Error('Invalid new ratings calculated');
        }
        
        console.log('Inserting into Journal...');
        await pool.query(
            `INSERT INTO Journal 
            (username, puzzle_id, success, time, rating, rd, volatility) 
            VALUES ($1, $2, $3, $4, $5, $6, $7)`,
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
        console.log('Journal updated');

        return newRatings;
    } catch (err) {
        console.error('Detailed error in recordPuzzleSolution:', {
            error: err,
            message: err.message,
            stack: err.stack,
            input: { username, puzzleId, success, time }
        });
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
    
    // Новый рейтинг
    const newRating = userRating.rating + (q / (1 / (RD * RD) + 1 / d2)) * g * (R - E);
    
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
        // Генерируем новую головоломку
        const puzzle = generateRandomPuzzle();
        
        // Сохраняем в базу данных
        const result = await pool.query(
            `INSERT INTO Puzzles 
            (fen, move_1, move_2, solution, type, color, difficulty, rating, rd, volatility)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            RETURNING *`,
            [
                puzzle.fen,
                puzzle.move_1,
                puzzle.move_2,
                puzzle.solution,
                puzzle.type,
                puzzle.color,
                puzzle.difficulty,
                puzzle.rating,
                350.0,
                0.06
            ]
        );
        
        res.json(result.rows[0]);
    } catch (err) {
        console.error('Error generating puzzle:', err);
        res.status(500).json({ 
            error: err.message,
            // Возвращаем базовую головоломку в случае ошибки
            ...generateRandomPuzzle()
        });
    }
});

app.post('/api/record-solution', async (req, res) => {
    try {
        console.log('Received request body:', req.body);
        const { username, puzzleId, success, time } = req.body;
        
        // Проверяем подключение к базе
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            
            const result = await recordPuzzleSolution(username, puzzleId, success, time);
            
            await client.query('COMMIT');
            console.log('Solution recorded successfully:', result);
            res.json(result);
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    } catch (err) {
        console.error('Error in /api/record-solution:', err);
        res.status(500).json({ 
            error: err.message,
            details: err.stack
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

// Запускаем сервер
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
