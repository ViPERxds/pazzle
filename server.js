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

async function generateRandomPuzzle() {
    const puzzles = [
        // Легкие задачи
        {
            fen: 'r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 0 1',
            move_1: 'h5f7',
            move_2: 'e8f7',
            solution: 'Good',
            type: 'Mate in 1',
            difficulty: 'easy'
        },
        // Исправляем задачу с некорректным ходом пешки
        {
            fen: 'r2qkb1r/ppp2ppp/2n2n2/3p4/3P4/2N2N2/PPP2PPP/R1BQK2R w KQkq - 0 1',
            move_1: 'f3e5',
            move_2: 'f6e4',
            solution: 'Blunder',
            type: 'Knight Fork',
            difficulty: 'easy'
        },
        // Добавляем новую корректную задачу вместо проблемной
        {
            fen: 'r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/2N2N2/PPPP1PPP/R1BQK2R w KQkq - 0 1',
            move_1: 'f3e5',
            move_2: 'f6e4',
            solution: 'Good',
            type: 'Knight Exchange',
            difficulty: 'easy'
        },
        // Средние задачи
        {
            fen: 'r4rk1/ppp2ppp/2n5/2bqp3/8/P1N5/1PP1QPPP/R1B2RK1 b - - 0 1',
            move_1: 'd5f3',
            move_2: 'g2f3',
            solution: 'Good',
            type: 'Queen Sacrifice',
            difficulty: 'medium'
        },
        {
            fen: '2r3k1/pp3pp1/4p3/3pP3/6P1/2P5/PP3P2/2KR4 w - - 0 1',
            move_1: 'd1d5',
            move_2: 'c8c3',
            solution: 'Blunder',
            type: 'Rook Pin',
            difficulty: 'medium'
        },
        {
            fen: 'r1b2rk1/ppq2ppp/2pb1n2/3p4/3P4/2NBP3/PPQ2PPP/R1B2RK1 w - - 0 1',
            move_1: 'c3e2',
            move_2: 'c7g3',
            solution: 'Blunder',
            type: 'Queen Attack',
            difficulty: 'medium'
        },
        // Сложные задачи
        {
            fen: 'r2q1rk1/ppp2ppp/2n1bP2/2b5/2B5/2N5/PPP2PPP/R1BQ1RK1 w - - 0 1',
            move_1: 'c4e6',
            move_2: 'd8d1',
            solution: 'Blunder',
            type: 'Queen Counter',
            difficulty: 'hard'
        },
        {
            fen: 'r1bq1rk1/pp3ppp/2n1pn2/2p5/2BP4/2N1PN2/PP3PPP/R2QK2R w KQ - 0 1',
            move_1: 'c4f7',
            move_2: 'g8f7',
            solution: 'Good',
            type: 'Bishop Sacrifice',
            difficulty: 'hard'
        },
        // Добавляем новые задачи
        {
            fen: '3r2k1/p4ppp/1q6/3B4/8/P4N2/5PPP/3R2K1 w - - 0 1',
            move_1: 'd5f7',
            move_2: 'g8f7',
            solution: 'Good',
            type: 'Bishop Sacrifice',
            difficulty: 'medium'
        },
        {
            fen: 'r4rk1/pp3ppp/2p5/4b3/4P3/2N5/PPP2PPP/2KR3R w - - 0 1',
            move_1: 'c3e4',
            move_2: 'e5c3',
            solution: 'Blunder',
            type: 'Bishop Fork',
            difficulty: 'medium'
        },
        // Дополнительные легкие задачи
        {
            fen: 'r1b2rk1/ppp2ppp/2n5/3q4/8/2N5/PPP2PPP/R1BQ1RK1 w - - 0 1',
            move_1: 'c3e4',
            move_2: 'd5e4',
            solution: 'Good',
            type: 'Knight Fork',
            difficulty: 'easy'
        },
        {
            fen: 'r3kb1r/ppp2ppp/2n5/3q4/8/2N5/PPP2PPP/R1B1K2R w KQkq - 0 1',
            move_1: 'c3e4',
            move_2: 'd5d1',
            solution: 'Blunder',
            type: 'Queen Attack',
            difficulty: 'easy'
        },
        // Дополнительные средние задачи
        {
            fen: 'r1b2rk1/pp3ppp/2n2n2/2p5/2B5/2NP4/PPP2PPP/R1B1K2R w KQ - 0 1',
            move_1: 'c4f7',
            move_2: 'f6d5',
            solution: 'Blunder',
            type: 'Knight Defense',
            difficulty: 'medium'
        },
        {
            fen: 'r4rk1/ppp2ppp/3p4/4P3/1b6/2N5/PPP2PPP/R3KB1R w KQ - 0 1',
            move_1: 'c3d5',
            move_2: 'b4e1',
            solution: 'Blunder',
            type: 'Bishop Attack',
            difficulty: 'medium'
        },
        {
            fen: 'r2qkb1r/ppp2ppp/2n5/3p4/3P4/2N2N2/PPP2PPP/R1BQK2R w KQkq - 0 1',
            move_1: 'f3e5',
            move_2: 'c6e5',
            solution: 'Good',
            type: 'Knight Exchange',
            difficulty: 'medium'
        },
        // Дополнительные сложные задачи
        {
            fen: 'r1bq1rk1/ppp2ppp/2n5/3p4/2BP4/2N1P3/PP3PPP/R2QK2R w KQ - 0 1',
            move_1: 'c4f7',
            move_2: 'c6e5',
            solution: 'Blunder',
            type: 'Knight Defense',
            difficulty: 'hard'
        },
        {
            fen: 'r3k2r/ppp2ppp/2n5/3B4/8/2P5/PP3PPP/R3K2R w KQkq - 0 1',
            move_1: 'd5f7',
            move_2: 'e8f7',
            solution: 'Good',
            type: 'Bishop Sacrifice',
            difficulty: 'hard'
        },
        {
            fen: 'r1bqk2r/ppp2ppp/2n5/3p4/2B5/2N5/PPP2PPP/R2QK2R w KQkq - 0 1',
            move_1: 'c4f7',
            move_2: 'e8f7',
            solution: 'Good',
            type: 'Bishop Sacrifice',
            difficulty: 'hard'
        },
        // Тактические комбинации
        {
            fen: 'r2qk2r/ppp2ppp/2n5/3p4/2B5/2N5/PPP2PPP/R2Q1RK1 w kq - 0 1',
            move_1: 'c4e6',
            move_2: 'd8d1',
            solution: 'Blunder',
            type: 'Queen Counter',
            difficulty: 'medium'
        },
        {
            fen: 'r1bqk2r/ppp2ppp/2n5/3p4/3P4/2N2N2/PPP2PPP/R1BQK2R w KQkq - 0 1',
            move_1: 'f3d2',
            move_2: 'd5d4',
            solution: 'Good',
            type: 'Pawn Attack',
            difficulty: 'medium'
        },
        // Убираем проблемную задачу и добавляем новую
        {
            fen: 'r1bq1rk1/ppp2ppp/2n2n2/2b1p3/2B1P3/2N2N2/PPPP1PPP/R1BQ1RK1 w - - 0 1',
            move_1: 'c4e6',
            move_2: 'f6e4',
            solution: 'Blunder',
            type: 'Knight Counter',
            difficulty: 'medium'
        },
        {
            fen: 'r2qk2r/ppp2ppp/2n1bn2/3p4/3P4/2N2N2/PPP1BPPP/R1BQK2R w KQkq - 0 1',
            move_1: 'f3e5',
            move_2: 'f6e4',
            solution: 'Good',
            type: 'Knight Tactics',
            difficulty: 'medium'
        },
        {
            fen: 'r1bqk2r/ppp2ppp/2n5/2bPp3/4P3/2N2N2/PPP2PPP/R1BQK2R b KQkq - 0 1',
            move_1: 'c5f2',
            move_2: 'e1f2',
            solution: 'Good',
            type: 'Bishop Sacrifice',
            difficulty: 'medium'
        }
    ];

    // Убираем использование Set и просто возвращаем случайную задачу
    const position = puzzles[Math.floor(Math.random() * puzzles.length)];
    
    // Определяем цвет из FEN
    position.color = position.fen.includes(' w ') ? 'W' : 'B';

    return position;
}

// Функция для поиска задачи для пользователя
async function findPuzzleForUser(username) {
    try {
        let position;
        let attempts = 0;
        const maxAttempts = 50;

        // Пытаемся найти нерешенную задачу
        do {
            position = await generateRandomPuzzle();
            const isSolved = await isPuzzleSolved(username, position.fen);
            if (!isSolved) {
                break;
            }
            attempts++;
        } while (attempts < maxAttempts);

        // Если все задачи решены, очищаем историю
        if (attempts >= maxAttempts) {
            await pool.query('DELETE FROM SolvedPuzzles WHERE username = $1', [username]);
            position = await generateRandomPuzzle();
        }

        const result = await pool.query(
            `INSERT INTO Puzzles 
            (rating, rd, volatility, fen, move_1, move_2, solution, type, color, difficulty)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            RETURNING *`,
            [
                1500,
                350.0,
                0.06,
                position.fen,
                position.move_1,
                position.move_2,
                position.solution,
                position.type,
                position.color,
                position.difficulty
            ]
        );

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
        
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            
            const result = await recordPuzzleSolution(username, puzzleId, success, time);
            
            // Если решение правильное, отмечаем задачу как решенную
            if (success) {
                const puzzle = await client.query('SELECT fen FROM Puzzles WHERE id = $1', [puzzleId]);
                if (puzzle.rows[0]) {
                    await markPuzzleAsSolved(username, puzzle.rows[0].fen);
                }
            }
            
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

// Функция для записи решенной задачи
async function markPuzzleAsSolved(username, fen) {
    try {
        await pool.query(
            'INSERT INTO SolvedPuzzles (username, puzzle_fen) VALUES ($1, $2) ON CONFLICT DO NOTHING',
            [username, fen]
        );
    } catch (err) {
        console.error('Error marking puzzle as solved:', err);
    }
}
