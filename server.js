require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const path = require('path');
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
        },
        // Добавляем новые тактические задачи
        {
            fen: '1rr3k1/3b1ppp/4pn2/p2pP3/1P1P4/P1B2N2/5PPP/2R2RK1 w - - 0 1',
            move_1: 'e5e6',
            move_2: 'd7e6',
            solution: 'Good',
            type: 'Discovered Attack',
            difficulty: 'medium'
        },
        {
            fen: 'r3k2r/ppp2ppp/2n5/3q4/2B5/2N5/PPP2PPP/R3K2R w KQkq - 0 1',
            move_1: 'c3e4',
            move_2: 'd5e4',
            solution: 'Good',
            type: 'Fork',
            difficulty: 'medium'
        },
        {
            fen: 'r1bqk2r/ppp2ppp/2n5/2bpP3/8/2N2N2/PPP2PPP/R1BQK2R w KQkq - 0 1',
            move_1: 'f3d4',
            move_2: 'c5d4',
            solution: 'Good',
            type: 'Pin',
            difficulty: 'medium'
        },
        // Добавляем позицию с пешечным шахом
        {
            fen: '1k1r4/ppp2ppp/8/2b1P3/2B5/8/PPP2PPP/2K5 w - - 0 1',
            move_1: 'e5e6',
            move_2: 'c5e3',
            solution: 'Good',
            type: 'Discovered Check',
            difficulty: 'easy'
        },
        // Заменяем на корректную позицию
        {
            fen: 'r1bqk2r/ppp2ppp/2n5/2b1p3/2B5/2N2N2/PPPP1PPP/R1BQK2R w KQkq - 0 1',
            move_1: 'c4f7',
            move_2: 'e8f7',
            solution: 'Good',
            type: 'Fork',
            difficulty: 'medium'
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
    position.color = position.fen.includes(' w ') ? 'W' : 'B';

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
        console.log('Getting rating for user:', username);
        const result = await pool.query(
            `SELECT rating, rd, volatility 
            FROM Journal 
            WHERE username = $1 
            ORDER BY date DESC 
            LIMIT 1`,
            [username]
        );
        
        console.log('Database result for user rating:', result.rows);
        
        if (result.rows.length === 0) {
            const defaultRating = {
                rating: 0,
                rd: 350,
                volatility: 0.06
            };
            console.log('No rating found, using default:', defaultRating);
            return defaultRating;
        }
        
        const rating = {
            rating: Number(result.rows[0].rating),
            rd: Number(result.rows[0].rd),
            volatility: Number(result.rows[0].volatility)
        };
        console.log('Found rating:', rating);
        return rating;
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
        const result = await findPuzzleForUser(req.params.username);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
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

// Изменим порт на переменную окружения
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
