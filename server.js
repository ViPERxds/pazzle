document.addEventListener('DOMContentLoaded', function() {
    const startPage = document.getElementById('startPage');
    const puzzlePage = document.getElementById('puzzlePage');
    const resultPage = document.getElementById('resultPage');
    const startButton = document.querySelector('.start-btn');
    const resultText = document.getElementById('resultText');
    const ratingElements = document.querySelectorAll('.rating');
    const goodButton = document.querySelector('.good-btn');
    const blunderButton = document.querySelector('.blunder-btn');
    const timerElement = document.querySelector('.timer');
    
    // Определяем API URL
    const API_URL = window.location.origin;  // Используем текущий домен
    
    let currentPuzzle = null;
    let timer = null;
    let startTime = null;
    let seconds = 180;
    
    // Инициализация конфигурации задачи
    let puzzleConfig = {
        initialFen: '',
        preMove: '',
        evaluatedMove: '',
        orientation: 'white',
        solution: false
    };
    
    // Инициализация игры
    let game = new Chess();
    let board = null;
    
    // Функция инициализации доски
    function initializeBoard(puzzleConfig) {
        const config = {
            draggable: true,
            position: puzzleConfig.initialFen,
            orientation: puzzleConfig.orientation,
            onDrop: onDrop,
            moveSpeed: 0,
            snapbackSpeed: 0,
            snapSpeed: 0,
            trashSpeed: 0,
            appearSpeed: 0
        };
        board = Chessboard('myBoard', config);
        game.load(puzzleConfig.initialFen);
        
        // Делаем предварительный ход
        const from = puzzleConfig.move1.substring(0, 2);
        const to = puzzleConfig.move1.substring(2, 4);
        game.move({ from: from, to: to, promotion: 'q' });
        board.position(game.fen(), false);

        // Показываем стрелку для следующего хода (move2)
        const move2From = puzzleConfig.move2.substring(0, 2);
        const move2To = puzzleConfig.move2.substring(2, 4);
        drawArrow(move2From, move2To);
    }
    
    // Функции для обработки ходов
    function onDragStart(source, piece, position, orientation) {
        // Разрешаем перемещение только после предварительного хода
        if (game.history().length === 0) {
            return false;
        }
        
        // Разрешаем перемещение только своих фигур
        if ((game.turn() === 'w' && piece.search(/^b/) !== -1) ||
            (game.turn() === 'b' && piece.search(/^w/) !== -1)) {
            return false;
        }
        
        return true;
    }
    
    function onDrop(source, target) {
        // Проверяем возможность хода
        const move = game.move({
            from: source,
            to: target,
            promotion: 'q' // Всегда превращаем в ферзя
        });
        
        // Если ход невозможен, возвращаем фигуру
        if (move === null) return 'snapback';
        
        // Проверяем, является ли это ходом для оценки
        if (puzzleConfig.evaluatedMove) {
            const moveStr = move.from + move.to;
            if (moveStr === puzzleConfig.evaluatedMove) {
                submitSolution(true);
            } else {
                submitSolution(false);
            }
        }
    }
    
    function onSnapEnd() {
        board.position(game.fen());
    }
    
    // Проверяем, найдены ли элементы
    console.log('API URL:', API_URL);
    console.log('Elements found:', {
        goodButton,
        blunderButton,
        startButton,
        puzzlePage,
        resultPage
    });

    // Инициализация Telegram WebApp
    const tg = window.Telegram.WebApp;
    tg.expand(); // Раскрываем на весь экран
    
    // Получаем имя пользователя из Telegram
    let currentUsername = tg.initDataUnsafe?.user?.username || 'test_user';
    
    // Добавляем цвета из темы Telegram
    document.documentElement.style.setProperty('--tg-theme-bg-color', tg.backgroundColor);
    document.documentElement.style.setProperty('--tg-theme-text-color', tg.textColor);
    document.documentElement.style.setProperty('--tg-theme-button-color', tg.buttonColor);
    document.documentElement.style.setProperty('--tg-theme-button-text-color', tg.buttonTextColor);

    // Упрощенная функция для запросов к API
    async function fetchWithAuth(url, options = {}) {
        try {
            console.log('Fetching:', url, options);
            
            // Используем реальный запрос к API
            const headers = {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            };
            
            if (options.headers) {
                Object.keys(options.headers).forEach(key => {
                    headers[key] = options.headers[key];
                });
            }
            
            const response = await fetch(url, {
                ...options,
                headers: headers,
                mode: 'cors'
            });
            
            if (!response.ok) {
                const errorText = await response.text();
                console.error('API error:', response.status, errorText);
                throw new Error(`Ошибка API: ${response.status} ${response.statusText}. ${errorText}`);
            }
            
            const data = await response.json();
            console.log('API response:', data);
            return data;
        } catch (err) {
            console.error('Fetch error:', err);
            throw err;
        }
    }

    // Функция для обновления отображения рейтинга
    async function updateRatingDisplay(username) {
        try {
            const userRating = await fetchWithAuth(`${API_URL}/api/user-rating/${username}`);
            console.log('Received user rating:', userRating);
            
            if (!userRating || !userRating.rating) {
                throw new Error('getUserRating is not defined');
            }
            
            const rating = parseFloat(userRating.rating).toFixed(0);
            ratingElements.forEach(el => {
                el.textContent = rating;
                el.style.color = 'black';
            });
            return rating;
        } catch (err) {
            console.error('Error updating rating:', err);
            ratingElements.forEach(el => {
                el.textContent = '1500';
                el.style.color = 'red';
            });
            return 1500;
        }
    }

    // Вызываем обновление рейтинга при загрузке страницы
    updateRatingDisplay(currentUsername);
    
    function startStopwatch() {
        let seconds = 0;
        const maxTime = 180; // 3 минуты в секундах
        
        // Очищаем предыдущий интервал если он был
        if (window.timerInterval) {
            clearInterval(window.timerInterval);
        }

        // Устанавливаем начальное время
        startTime = Date.now();

        // Обновляем отображение времени каждую секунду
        window.timerInterval = setInterval(() => {
            seconds++;
            
            // Форматируем время в MM:SS
            const minutes = Math.floor(seconds / 60);
            const remainingSeconds = seconds % 60;
            const timeString = `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
            
            timerElement.textContent = timeString;
            
            // Если прошло 3 минуты, останавливаем секундомер
            if (seconds >= maxTime) {
                clearInterval(window.timerInterval);
                // Автоматически отправляем текущее решение как неверное
                handlePuzzleResult(false);
            }
        }, 1000);

        return seconds;
    }

    // Обновляем функцию submitSolution
    async function submitSolution(success) {
        try {
            if (!currentPuzzle || !currentPuzzle.id) {
                console.error('No current puzzle or puzzle ID!');
                showError('Нет текущей задачи!');
                return;
            }

            // Останавливаем таймер
            if (window.timerInterval) {
                clearInterval(window.timerInterval);
            }

            // Получаем время решения
            const elapsedTime = Math.floor((Date.now() - startTime) / 1000);

            console.log('Sending solution:', {
                username: currentUsername,
                puzzleId: currentPuzzle.id,
                success: success,
                time: elapsedTime
            });

            const result = await fetchWithAuth(`${API_URL}/api/record-solution`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    username: currentUsername,
                    puzzleId: currentPuzzle.id,
                    success: success,
                    time: elapsedTime
                })
            });

            console.log('Solution recorded:', result);

            // Обновляем отображение рейтинга
            await updateRatingDisplay(currentUsername);

            // Показываем результат
            puzzlePage.classList.add('hidden');
            resultPage.classList.remove('hidden');
            resultText.textContent = success ? 'Правильно!' : 'Неправильно!';
            resultText.className = success ? 'success' : 'failure';

        } catch (error) {
            console.error('Error submitting solution:', error);
            showError('Ошибка при отправке решения: ' + error.message);
        }
    }

    // Обновляем функцию showPuzzle
    function showPuzzle(puzzle) {
        if (!puzzle) {
            console.error('No puzzle data provided');
            return;
        }

        console.log('Showing puzzle:', puzzle);

        // Определяем цвет из строкового значения 'w' или 'b'
        const orientation = puzzle.color === 'w' ? 'white' : 'black';
        
        // Обновляем конфигурацию
        puzzleConfig.initialFen = puzzle.fen1;
        puzzleConfig.preMove = puzzle.move1;
        puzzleConfig.evaluatedMove = puzzle.move2;
        puzzleConfig.orientation = orientation;
        puzzleConfig.solution = puzzle.solution === 'Good';

        console.log('Updated puzzle config:', puzzleConfig);

        // Сбрасываем состояние игры
        game = new Chess();
        initializeBoard(puzzleConfig);
    }

    // Улучшенная функция загрузки задачи
    async function loadPuzzle(username) {
        try {
            console.log('Loading puzzle for user:', username);
            
            // Получаем задачу через API
            const puzzle = await fetchWithAuth(`${API_URL}/api/random-puzzle/${username}`);
            console.log('Received puzzle:', puzzle);
            
            if (!puzzle) {
                throw new Error('Не удалось получить данные задачи');
            }
            
            if (!puzzle.fen1) {
                throw new Error('Отсутствует FEN позиция');
            }
            
            if (!puzzle.move1) {
                throw new Error('Отсутствует предварительный ход');
            }
            
            if (!puzzle.move2) {
                puzzle.move2 = '';  // Устанавливаем пустую строку если move2 отсутствует
            }
            
            if (!puzzle.id) {
                throw new Error('Отсутствует ID задачи');
            }

            // Сохраняем текущую задачу
            currentPuzzle = puzzle;
            
            // Показываем задачу
            showPuzzle(puzzle);
            
            // Запускаем таймер
            startStopwatch();
            
            // Показываем страницу с задачей
            startPage.classList.add('hidden');
            puzzlePage.classList.remove('hidden');
            resultPage.classList.add('hidden');
            
        } catch (err) {
            console.error('Error loading puzzle:', err);
            showError('Ошибка при загрузке задачи: ' + err.message);
        }
    }

    // Добавляем обработчики событий
    startButton.addEventListener('click', () => loadPuzzle(currentUsername));
    goodButton.addEventListener('click', () => submitSolution(true));
    blunderButton.addEventListener('click', () => submitSolution(false));
    
    // Добавляем обработчик для кнопки Next
    document.querySelector('.next-btn').addEventListener('click', () => {
        // Скрываем страницу результата
        resultPage.classList.add('hidden');
        // Загружаем новую задачу
        loadPuzzle(currentUsername);
    });

    // Обработчик результата задачи
    async function handlePuzzleResult(isCorrect) {
        try {
            // Останавливаем таймер
            if (window.timerInterval) {
                clearInterval(window.timerInterval);
            }
            
            // Отправляем решение
            await submitSolution(isCorrect);
        } catch (error) {
            console.error('Error handling puzzle result:', error);
            showError('Ошибка при обработке результата: ' + error.message);
        }
    }

    // Добавляем обработчик для кнопки анализа
    document.querySelector('.analyze-btn').addEventListener('click', () => {
        // Используем FEN позиции после предварительного хода
        const [from, to] = puzzleConfig.preMove.match(/.{2}/g);
        game.load(puzzleConfig.initialFen); // Загружаем начальную позицию
        game.move({ from, to, promotion: 'q' }); // Делаем предварительный ход
        
        // Получаем FEN после предварительного хода и форматируем его для URL
        const fen = game.fen().replace(/ /g, '_');
        const color = puzzleConfig.orientation;
        
        // Открываем страницу анализа на lichess
        window.open(`https://lichess.org/analysis/${fen}?color=${color}`, '_blank');
        
        // Возвращаем доску к текущей позиции
        game.load(puzzleConfig.initialFen);
        game.move({ from, to, promotion: 'q' });
    });

    // Функция для отрисовки стрелок
    function drawArrow(from, to) {
        console.log('Drawing arrow for move:', from + to);
        
        // Удаляем старую стрелку
        const oldArrow = document.querySelector('.arrow');
        if (oldArrow) oldArrow.remove();

        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.setAttribute("class", "arrow");
        svg.style.position = 'absolute';
        svg.style.top = '0';
        svg.style.left = '0';
        svg.style.width = '100%';
        svg.style.height = '100%';
        svg.style.pointerEvents = 'none';
        svg.style.zIndex = '1000';
        
        const board = document.querySelector('#myBoard');
        if (!board) {
            console.error('Board element not found');
            return;
        }
        
        const fromSquare = board.querySelector(`[data-square="${from}"]`);
        const toSquare = board.querySelector(`[data-square="${to}"]`);
        const boardRect = board.getBoundingClientRect();
        const fromRect = fromSquare.getBoundingClientRect();
        const toRect = toSquare.getBoundingClientRect();
        const squareSize = boardRect.width / 8;

        // Координаты
        const x1 = fromRect.left - boardRect.left + fromRect.width/2;
        const y1 = fromRect.top - boardRect.top + fromRect.height/2;
        const x2 = toRect.left - boardRect.left + toRect.width/2;
        const y2 = toRect.top - boardRect.top + toRect.height/2;

        // Вычисляем угол и размеры
        const angle = Math.atan2(y2 - y1, x2 - x1);
        const width = squareSize * 0.15;
        const headWidth = squareSize * 0.3;
        const headLength = squareSize * 0.3;

        // Точки для стрелки
        const dx = Math.cos(angle);
        const dy = Math.sin(angle);
        const length = Math.sqrt((x2-x1)**2 + (y2-y1)**2) - headLength;

        // Создаем путь для стрелки
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", `
            M ${x1 - width*dy} ${y1 + width*dx}
            L ${x1 + length*dx - width*dy} ${y1 + length*dy + width*dx}
            L ${x1 + length*dx - headWidth*dy} ${y1 + length*dy + headWidth*dx}
            L ${x2} ${y2}
            L ${x1 + length*dx + headWidth*dy} ${y1 + length*dy - headWidth*dx}
            L ${x1 + length*dx + width*dy} ${y1 + length*dy - width*dx}
            L ${x1 + width*dy} ${y1 - width*dx}
            Z
        `);
        // Всегда используем зеленый цвет для стрелки
        path.setAttribute("fill", "#00ff00");
        path.setAttribute("opacity", "0.5");

        svg.appendChild(path);
        board.appendChild(svg);
    }

    // Обработчик клика по доске для показа/скрытия стрелки
    $('#board').on('click', function() {
        const arrow = document.querySelector('.arrow');
        if (arrow) {
            arrow.style.display = arrow.style.display === 'none' ? 'block' : 'none';
        }
    });

    // Функция для отображения ошибок
    function showError(message) {
        // Показываем ошибку пользователю
        alert(message);
    }
}); 
