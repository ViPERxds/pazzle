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
    
    // Проверяем, найдены ли элементы
    console.log('Elements found:', {
        goodButton,
        blunderButton,
        startButton,
        puzzlePage,
        resultPage
    });

    let currentPuzzle = null;
    let timer = null;
    let startTime = null;
    let seconds = 180; 

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

    // Используем глобальную конфигурацию
    const API_URL = 'https://chess-puzzles-bot.onrender.com/api';

    async function fetchWithAuth(url, options = {}) {
        try {
            console.log('Fetching:', url, options);
            const response = await fetch(url, {
                ...options,
                headers: {
                    ...options.headers,
                    'Authorization': `Bearer ${initData}`
                }
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
            const userRating = await fetchWithAuth(`${API_URL}/user-rating/${username}`);
            console.log('Received user rating:', userRating);
            
            const rating = userRating?.rating || 1500;
            ratingElements.forEach(el => {
                el.textContent = Math.round(rating);
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
    
    // Обновляем рейтинг каждые 5 секунд
    setInterval(() => updateRatingDisplay(currentUsername), 5000);

    function startStopwatch() {
        let seconds = 0;
        const maxTime = 180; // 3 минуты в секундах
        
        // Очищаем предыдущий интервал если он был
        if (window.timerInterval) {
            clearInterval(window.timerInterval);
        }

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

    function submitSolution(success) {
        // Останавливаем секундомер
        clearInterval(window.timerInterval);
        
        // Получаем прошедшее время в секундах
        const timeDisplay = timerElement.textContent;
        const [minutes, seconds] = timeDisplay.split(':').map(Number);
        const totalSeconds = minutes * 60 + seconds;
        
        // Остальной код функции остается без изменений...
    }

    function showPuzzle(puzzle) {
        // ... существующий код ...
        
        // Запускаем секундомер вместо таймера
        startStopwatch();
        
        // ... остальной код ...
    }

    async function loadPuzzle(username) {
        try {
            console.log('Loading puzzle for user:', username);
            const puzzle = await fetchWithAuth(`${API_URL}/random-puzzle/${username || 1}`);
            console.log('Received puzzle data:', puzzle);
            
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
                throw new Error('Отсутствует оцениваемый ход');
            }
            
            if (!puzzle.id) {
                throw new Error('Отсутствует ID задачи');
            }

            // Проверяем валидность FEN
            const tempGame = new Chess();
            try {
                if (!tempGame.load(puzzle.fen1)) {
                    throw new Error('Некорректная позиция');
                }
            } catch (e) {
                throw new Error('Некорректная FEN позиция: ' + e.message);
            }

            // Проверяем валидность предварительного хода
            try {
                const [fromPre, toPre] = puzzle.move1.match(/.{2}/g) || [];
                if (!fromPre || !toPre) {
                    throw new Error('Неверный формат предварительного хода');
                }
                
                // Проверяем, есть ли фигура на начальной позиции
                if (!tempGame.get(fromPre)) {
                    throw new Error('Нет фигуры на начальной позиции предварительного хода');
                }
                
                const moveResult = tempGame.move({ from: fromPre, to: toPre, promotion: 'q' });
                if (!moveResult) {
                    throw new Error('Невозможно выполнить предварительный ход');
                }
            } catch (e) {
                throw new Error('Некорректный предварительный ход: ' + e.message);
            }

            // Проверяем валидность оцениваемого хода
            try {
                const [fromEval, toEval] = puzzle.move2.match(/.{2}/g) || [];
                if (!fromEval || !toEval) {
                    throw new Error('Неверный формат оцениваемого хода');
                }
                
                // Проверяем, есть ли фигура на начальной позиции
                if (!tempGame.get(fromEval)) {
                    throw new Error('Нет фигуры на начальной позиции оцениваемого хода');
                }
            } catch (e) {
                throw new Error('Некорректный оцениваемый ход: ' + e.message);
            }

            return puzzle;
        } catch (err) {
            console.error('Error loading puzzle:', err);
            throw err;
        }
    }

    // Обработчик кнопки START
    startButton.addEventListener('click', async () => {
        try {
            startPage.classList.add('hidden');
            puzzlePage.classList.remove('hidden');
            
            currentPuzzle = await loadPuzzle(currentUsername);
            
            // Определяем, кто должен ходить из FEN позиции
            const fenParts = currentPuzzle.fen1.split(' ');
            const colorToMove = fenParts[1];
            
            // Обновляем конфигурацию
            puzzleConfig.initialFen = currentPuzzle.fen1;
            puzzleConfig.preMove = currentPuzzle.move1;
            puzzleConfig.evaluatedMove = currentPuzzle.move2;
            puzzleConfig.orientation = colorToMove === 'w' ? 'white' : 'black';
            puzzleConfig.solution = currentPuzzle.solution;

            // Сбрасываем состояние игры
            game = new Chess();
            await initializeBoard();
        } catch (err) {
            console.error('Error starting puzzle:', err);
            showError('Ошибка при загрузке задачи: ' + err.message);
            startPage.classList.remove('hidden');
            puzzlePage.classList.add('hidden');
        }
    });

    // Инициализация кнопок
    function initializeButtons() {
        if (goodButton) {
            goodButton.addEventListener('click', async () => {
                try {
                    if (!currentPuzzle || !currentPuzzle.id) {
                        console.error('No current puzzle!');
                        alert('Ошибка: нет активной задачи');
                        return;
                    }
                    
                    // Останавливаем таймер
                    if (window.timerInterval) {
                        clearInterval(window.timerInterval);
                    }
                    
                    const timeDisplay = timerElement.textContent;
                    const [minutes, seconds] = timeDisplay.split(':').map(Number);
                    const totalSeconds = minutes * 60 + seconds;
                    
                    const data = {
                        puzzle_id: currentPuzzle.id,
                        user_id: 1,
                        success: true,
                        time: totalSeconds,
                        complexity_id: 4
                    };
                    
                    console.log('Sending data:', data);
                    
                    await fetchWithAuth(`${API_URL}/record-solution`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify(data)
                    });

                    // Обновляем интерфейс
                    puzzlePage.classList.add('hidden');
                    resultPage.classList.remove('hidden');
                    resultText.textContent = currentPuzzle.solution === 'Good' ? 'Correct!' : 'Wrong!';
                    resultText.style.color = currentPuzzle.solution === 'Good' ? '#4CAF50' : '#FF0000';
                    
                } catch (err) {
                    console.error('Error recording solution:', err);
                    alert('Ошибка при записи решения: ' + err.message);
                }
            });
        }

        if (blunderButton) {
            blunderButton.addEventListener('click', async () => {
                try {
                    if (!currentPuzzle || !currentPuzzle.id) {
                        console.error('No current puzzle!');
                        alert('Ошибка: нет активной задачи');
                        return;
                    }
                    
                    // Останавливаем таймер
                    if (window.timerInterval) {
                        clearInterval(window.timerInterval);
                    }
                    
                    const timeDisplay = timerElement.textContent;
                    const [minutes, seconds] = timeDisplay.split(':').map(Number);
                    const totalSeconds = minutes * 60 + seconds;
                    
                    const data = {
                        puzzle_id: currentPuzzle.id,
                        user_id: 1,
                        success: false,
                        time: totalSeconds,
                        complexity_id: 4
                    };
                    
                    console.log('Sending data:', data);
                    
                    await fetchWithAuth(`${API_URL}/record-solution`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify(data)
                    });

                    // Обновляем интерфейс
                    puzzlePage.classList.add('hidden');
                    resultPage.classList.remove('hidden');
                    resultText.textContent = currentPuzzle.solution === 'Blunder' ? 'Correct!' : 'Wrong!';
                    resultText.style.color = currentPuzzle.solution === 'Blunder' ? '#4CAF50' : '#FF0000';
                    
                } catch (err) {
                    console.error('Error recording solution:', err);
                    alert('Ошибка при записи решения: ' + err.message);
                }
            });
        }

        // Добавляем обработчик для кнопки Next
        const nextButton = document.querySelector('.next-btn');
        if (nextButton) {
            nextButton.addEventListener('click', async () => {
                try {
                    // Останавливаем таймер если есть
                    if (window.timerInterval) {
                        clearInterval(window.timerInterval);
                    }
                    
                    currentPuzzle = await loadPuzzle(currentUsername);
                    
                    // Определяем, кто должен ходить из FEN позиции
                    const fenParts = currentPuzzle.fen1.split(' ');
                    const colorToMove = fenParts[1];
                    
                    // Обновляем конфигурацию
                    puzzleConfig.initialFen = currentPuzzle.fen1;
                    puzzleConfig.preMove = currentPuzzle.move1;
                    puzzleConfig.evaluatedMove = currentPuzzle.move2;
                    puzzleConfig.orientation = colorToMove === 'w' ? 'white' : 'black';
                    puzzleConfig.solution = currentPuzzle.solution;

                    resultPage.classList.add('hidden');
                    puzzlePage.classList.remove('hidden');
                    
                    // Сбрасываем состояние игры
                    game = new Chess();
                    await initializeBoard();
                } catch (err) {
                    console.error('Error loading next puzzle:', err);
                    showError('Ошибка при загрузке следующей задачи: ' + err.message);
                    // Возвращаемся на страницу результата при ошибке
                    puzzlePage.classList.add('hidden');
                    resultPage.classList.remove('hidden');
                }
            });
        }
    }

    // Вызываем инициализацию кнопок после загрузки DOM
    initializeButtons();

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

    // Конфигурация шахматной задачи
    const puzzleConfig = {
        initialFen: '8/1pBrR3/p1bP4/P6p/5k2/7p/5K2/8 w - - 0 1', // Пример FEN
        preMove: 'e7d7', // Предварительный ход
        evaluatedMove: 'c7b6', // Оцениваемый ход
        orientation: 'white', // Ориентация доски
        preMoveDelay: 2000, // Задержка перед предварительным ходом в мс
        solution: 'Good' // Предполагаемый правильный ответ
    };

    let board = null;
    let game = new Chess();
    let arrow = null;

    // Функция для определения ориентации доски
    function getBoardOrientation(fen) {
        const fenParts = fen.split(' ');
        const colorToMove = fenParts[1]; // 'w' для белых, 'b' для черных
        return colorToMove === 'w' ? 'white' : 'black';
    }

    function initializeBoard() {
        return new Promise((resolve, reject) => {
            try {
                console.log('Initializing board with config:', puzzleConfig);
                
                // Очищаем предыдущий таймер если есть
                if (window.timerInterval) {
                    clearInterval(window.timerInterval);
                }
                
                // Сбрасываем время
                timerElement.textContent = '00:00';
                
                // Очищаем предыдущую стрелку
                const oldArrow = document.querySelector('.arrow');
                if (oldArrow) {
                    oldArrow.remove();
                }
                
                if (board) {
                    board.destroy();
                }

                // Проверяем валидность FEN и ходов
                if (!puzzleConfig.initialFen) {
                    throw new Error('Отсутствует FEN позиция');
                }
                
                try {
                    if (!game.load(puzzleConfig.initialFen)) {
                        throw new Error('Некорректная FEN позиция');
                    }
                } catch (e) {
                    throw new Error('Ошибка при загрузке позиции: ' + e.message);
                }

                if (!puzzleConfig.preMove || !puzzleConfig.preMove.match(/^[a-h][1-8][a-h][1-8]$/)) {
                    throw new Error('Некорректный формат предварительного хода');
                }

                board = Chessboard('board', {
                    position: puzzleConfig.initialFen,
                    orientation: puzzleConfig.orientation || 'white',
                    pieceTheme: 'https://lichess1.org/assets/piece/cburnett/{piece}.svg',
                    draggable: true,
                    moveSpeed: 'slow',
                    snapSpeed: 100,
                    snapbackSpeed: 250,
                    trashSpeed: 100,
                    showErrors: false,
                    onDragStart: function(source, piece) {
                        return game.turn() === (piece[0] === 'w' ? 'w' : 'b');
                    },
                    onDrop: function(source, target) {
                        // Получаем фигуру, которая делает ход
                        const piece = game.get(source);
                        if (!piece) return 'snapback';
                        
                        // Подсвечиваем начальную и конечную клетки
                        $(`[data-square="${source}"]`).addClass('highlight-square');
                        $(`[data-square="${target}"]`).addClass('highlight-square');
                        
                        // Проверяем, совпадает ли ход с оцениваемым ходом
                        const [fromEval, toEval] = puzzleConfig.evaluatedMove.match(/.{2}/g) || [];
                        if (source === fromEval && target === toEval) {
                            // Ход совпадает с оцениваемым
                            const move = game.move({
                                from: source,
                                to: target,
                                promotion: 'q' // Всегда превращаем в ферзя для простоты
                            });
                            
                            if (move === null) return 'snapback';
                            
                            // Обновляем доску
                            board.position(game.fen());
                            
                            // Останавливаем таймер
                            if (window.timerInterval) {
                                clearInterval(window.timerInterval);
                            }
                            
                            // Показываем результат
                            handlePuzzleResult(puzzleConfig.solution === 'Good');
                            
                            return;
                        }
                        
                        // Если ход не совпадает с оцениваемым, отменяем его
                        return 'snapback';
                    }
                });
                
                // Выполняем предварительный ход
                try {
                    const [fromPre, toPre] = puzzleConfig.preMove.match(/.{2}/g) || [];
                    if (!fromPre || !toPre) {
                        throw new Error('Некорректный формат предварительного хода');
                    }
                    
                    const moveResult = game.move({
                        from: fromPre,
                        to: toPre,
                        promotion: 'q'
                    });
                    
                    if (!moveResult) {
                        throw new Error('Невозможно выполнить предварительный ход');
                    }
                    
                    // Обновляем доску
                    board.position(game.fen());
                    
                    // Рисуем стрелку для предварительного хода
                    drawArrow(fromPre, toPre, 'blue');
                    
                    // Запускаем секундомер
                    startStopwatch();
                    
                    resolve();
                } catch (e) {
                    reject(new Error('Ошибка при выполнении предварительного хода: ' + e.message));
                }
            } catch (err) {
                console.error('Error initializing board:', err);
                reject(err);
            }
        });
    }

    function drawArrow(from, to, color = '#00ff00') {
        console.log('Drawing arrow for move:', from, to);
        
        // Удаляем старую стрелку
        const oldArrow = document.querySelector('.arrow');
        if (oldArrow) {
            oldArrow.remove();
        }
        
        if (!from || !to) {
            console.error('Invalid arrow parameters');
            return;
        }
        
        const fromCoords = getSquareCoords(from);
        const toCoords = getSquareCoords(to);
        
        if (!fromCoords || !toCoords) {
            console.error('Could not get coordinates for squares', from, to);
            return;
        }
        
        // Создаем SVG элемент
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.setAttribute("class", "arrow");
        svg.setAttribute("width", "100%");
        svg.setAttribute("height", "100%");
        svg.setAttribute("position", "absolute");
        svg.setAttribute("top", "0");
        svg.setAttribute("left", "0");
        svg.setAttribute("pointer-events", "none");
        svg.setAttribute("z-index", "1000");
        
        // Создаем путь для стрелки
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        
        // Вычисляем координаты и направление стрелки
        const startX = fromCoords.x;
        const startY = fromCoords.y;
        const endX = toCoords.x;
        const endY = toCoords.y;
        
        // Вычисляем угол стрелки
        const angle = Math.atan2(endY - startY, endX - startX);
        
        // Длина стрелки
        const length = Math.sqrt(Math.pow(endX - startX, 2) + Math.pow(endY - startY, 2));
        
        // Размер наконечника стрелки
        const arrowHeadSize = 15;
        
        // Координаты наконечника
        const arrowX = endX - arrowHeadSize * Math.cos(angle);
        const arrowY = endY - arrowHeadSize * Math.sin(angle);
        
        // Создаем путь для стрелки
        path.setAttribute("d", `
            M ${startX} ${startY}
            L ${arrowX} ${arrowY}
            L ${arrowX - arrowHeadSize * Math.cos(angle - Math.PI/6)} ${arrowY - arrowHeadSize * Math.sin(angle - Math.PI/6)}
            L ${endX} ${endY}
            L ${arrowX - arrowHeadSize * Math.cos(angle + Math.PI/6)} ${arrowY - arrowHeadSize * Math.sin(angle + Math.PI/6)}
            L ${arrowX} ${arrowY}
            Z
        `);
        path.setAttribute("fill", color);
        path.setAttribute("opacity", "0.5");

        svg.appendChild(path);
        document.getElementById('board').appendChild(svg);
    }

    function getSquareCoords(square) {
        if (!square || square.length !== 2) {
            console.error('Invalid square:', square);
            return null;
        }
        
        const boardElement = document.getElementById('board');
        if (!boardElement) {
            console.error('Board element not found');
            return null;
        }
        
        const squareElement = document.querySelector(`[data-square="${square}"]`);
        if (!squareElement) {
            console.error('Square element not found:', square);
            return null;
        }
        
        const boardRect = boardElement.getBoundingClientRect();
        const squareRect = squareElement.getBoundingClientRect();
        
        return {
            x: squareRect.left - boardRect.left + squareRect.width / 2,
            y: squareRect.top - boardRect.top + squareRect.height / 2
        };
    }

    // Обработчик клика по доске для показа/скрытия стрелки
    $('#board').on('click', function() {
        const arrow = document.querySelector('.arrow');
        if (arrow) {
            arrow.style.display = arrow.style.display === 'none' ? 'block' : 'none';
        }
    });

    // Инициализация при загрузке
    initializeBoard();

    // Обновляем функцию handlePuzzleResult
    async function handlePuzzleResult(isCorrect) {
        if (window.timerInterval) {
            clearInterval(window.timerInterval);
        }
        
        if (!currentPuzzle || !currentPuzzle.id) {
            console.error('No valid puzzle data');
            alert('Ошибка: нет данных о текущей задаче');
            return;
        }
        
        const timeDisplay = timerElement.textContent;
        const [minutes, seconds] = timeDisplay.split(':').map(Number);
        const totalSeconds = minutes * 60 + seconds;

        try {
            const data = {
                puzzle_id: currentPuzzle.id,
                user_id: 1,
                success: isCorrect,
                time: totalSeconds,
                complexity_id: 4
            };
            
            console.log('Sending data:', data);
            
            await fetchWithAuth(`${API_URL}/record-solution`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(data)
            });

            resultText.textContent = isCorrect ? 'Right!' : 'Wrong!';
            resultText.style.color = isCorrect ? '#4CAF50' : '#FF0000';
            puzzlePage.classList.add('hidden');
            resultPage.classList.remove('hidden');

        } catch (err) {
            console.error('Error recording solution:', err);
            alert('Ошибка при сохранении результата: ' + err.message);
        }
    }

    // Заменяем showError на простой alert
    function showError(message) {
        alert(message);
    }
}); 
