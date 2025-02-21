const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
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

// Функция для получения случайной задачи
async function getRandomPuzzle() {
    try {
        const result = await pool.query(
            'SELECT * FROM Puzzles ORDER BY RANDOM() LIMIT 1'
        );
        return result.rows[0];
    } catch (err) {
        console.error('Error getting random puzzle:', err);
        return null;
    }
}

// Функция для поиска задачи для пользователя
async function findPuzzleForUser(username) {
    try {
        // Шаг 1: Исключаем решенные задачи
        const result = await pool.query(
            `SELECT p.* FROM Puzzles p 
            WHERE NOT EXISTS (
                SELECT 1 FROM Journal j 
                WHERE j.puzzle_id = p.id 
                AND j.username = $1
            )
            ORDER BY RANDOM() 
            LIMIT 1`,
            [username]
        );

        if (result.rows.length === 0) {
            throw new Error('No available puzzles found');
        }

        return result.rows[0];
    } catch (err) {
        console.error('Error finding puzzle:', err);
        throw err;
    }
}

// Функция для записи результата решения
async function recordPuzzleSolution(username, puzzleId, success, time) {
    try {
        // Проверка входных данных
        if (typeof success !== 'boolean') {
            throw new Error('Success must be boolean');
        }
        if (time <= 0 || time > 180) { // максимум 3 минуты
            throw new Error('Invalid time value');
        }

        // Получаем настройки
        const settings = await getSettings();
        const normalTime = settings.normal_time || 60; // время в секундах для нормы решения

        // Вычисляем результат по формуле R = S * e^(-1/a * ln(2) * time)
        const R = success * Math.exp(-1/normalTime * Math.log(2) * time);

        // Получаем текущие рейтинги
        const userRating = await getUserRating(username);
        const puzzleRating = await getPuzzleRating(puzzleId);

        // Вычисляем новые рейтинги с использованием R вместо простого 0 или 1
        const newRatings = await calculateNewRatings(userRating, puzzleRating, R);

        // Записываем результат в журнал
        await pool.query(
            `INSERT INTO Journal 
            (username, puzzle_id, success, time, rating, rd, volatility, date) 
            VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)`,
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

        // Обновляем рейтинг задачи
        await pool.query(
            `UPDATE Puzzles 
            SET rating = $1, rd = $2, volatility = $3, number = number + 1 
            WHERE id = $4`,
            [
                newRatings.puzzleRating,
                newRatings.puzzleRD,
                newRatings.puzzleVolatility,
                puzzleId
            ]
        );

        return newRatings;
    } catch (err) {
        console.error('Error recording solution:', err);
        throw err;
    }
}

// Функция для получения настроек
async function getSettings() {
    try {
        const result = await pool.query('SELECT * FROM Settings');
        if (result.rows.length === 0) {
            // Возвращаем значения по умолчанию, если настройки не найдены
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
            // Если это первая задача пользователя, возвращаем начальные значения
            return {
                rating: 1500,
                rd: 350,
                volatility: 0.06
            };
        }
        
        return {
            rating: result.rows[0].rating,
            rd: result.rows[0].rd,
            volatility: result.rows[0].volatility
        };
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

// Обновляем функцию calculateNewRatings для использования алгоритма Glicko-2
async function calculateNewRatings(user, puzzle, R) {
    // Получаем настройки
    const settings = await getSettings();
    const τ = settings.tau || 0.5;
    const ε = settings.epsilon || 0.000001;
    
    // Проверка входных данных
    if (R < 0 || R > 1) {
        throw new Error('R must be between 0 and 1');
    }
    if (!user.rating || !user.rd || !user.volatility) {
        throw new Error('Invalid user rating data');
    }
    if (!puzzle.rating || !puzzle.rd || !puzzle.volatility) {
        throw new Error('Invalid puzzle rating data');
    }

    function g(φ) {
        return 1 / Math.sqrt(1 + 3 * φ * φ / (Math.PI * Math.PI));
    }

    function E(μ, μj, φj) {
        return 1 / (1 + Math.exp(-g(φj) * (μ - μj)));
    }

    // Преобразование в шкалу Glicko-2
    const μ = (user.rating - 1500) / 173.7178;
    const φ = user.rd / 173.7178;
    const σ = user.volatility;

    const μj = (puzzle.rating - 1500) / 173.7178;
    const φj = puzzle.rd / 173.7178;

    // Вычисление v
    const gφj = g(φj);
    const E_value = E(μ, μj, φj);
    const v = 1 / (gφj * gφj * E_value * (1 - E_value));

    // Вычисление Δ
    const Δ = v * gφj * (R - E_value);

    // Вычисление новой волатильности
    const a = Math.log(σ * σ);
    const f = (x) => {
        const ex = Math.exp(x);
        const part1 = ex * (Δ * Δ - φ * φ - v - ex);
        const part2 = 2 * (φ * φ + v + ex) * (φ * φ + v + ex);
        return part1 / part2 - (x - a) / (τ * τ);
    };

    // Поиск нового значения волатильности методом половинного деления
    let A = a;
    let B = f(a) < 0 ? a + τ : a - τ;
    while (Math.abs(B - A) > ε) {
        const C = A + (B - A) / 2;
        if (f(C) * f(B) < 0) {
            A = C;
        } else {
            B = C;
        }
    }

    const σ_new = Math.exp(A / 2);

    // Обновление φ и μ
    const φ_star = Math.sqrt(φ * φ + σ_new * σ_new);
    const φ_new = 1 / Math.sqrt(1 / (φ_star * φ_star) + 1 / v);
    const μ_new = μ + φ_new * φ_new * gφj * (R - E_value);

    // Преобразование обратно в оригинальную шкалу
    return {
        userRating: μ_new * 173.7178 + 1500,
        userRD: φ_new * 173.7178,
        userVolatility: σ_new,
        puzzleRating: (μj - Δ) * 173.7178 + 1500,
        puzzleRD: Math.sqrt(1 / (1 / (φj * φj) + 1 / v)) * 173.7178,
        puzzleVolatility: puzzle.volatility
    };
}

// Добавляем функцию для проверки соединения с базой данных
async function checkDatabaseConnection() {
    try {
        await pool.query('SELECT 1');
        return true;
    } catch (err) {
        console.error('Database connection error:', err);
        return false;
    }
}

module.exports = {
    checkUserAccess,
    getRandomPuzzle: findPuzzleForUser,
    recordPuzzleSolution,
    getSettings,
    getUserRating,
    getPuzzleRating,
    checkDatabaseConnection
}; 
