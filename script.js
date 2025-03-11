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

    // Обновляем функцию fetchWithAuth для реальных запросов к API
    async function fetchWithAuth(url, options = {}) {
        try {
            console.log('Fetching:', url, options);
            
            const headers = {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            };
            
            if (options.headers) {
                Object.assign(headers, options.headers);
            }
            
            const response = await fetch(url, {
                ...options,
                headers: headers
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

    // Обновляем функцию submitSolution для работы с реальным API
    async function submitSolution(success) {
        try {
            if (!currentPuzzle || !currentPuzzle.id) {
                console.error('No current puzzle or puzzle ID!');
                showError('Нет текущей задачи!');
                return;
            }
            
            const data = {
                username: currentUsername,
                puzzleId: currentPuzzle.id,
                success: success,
                time: elapsedTime
            };
            
            console.log('Sending solution:', data);
            
            const result = await fetchWithAuth(`${window.CONFIG.API_URL}/record-solution`, {
                method: 'POST',
                body: JSON.stringify(data)
            });
            
            // Останавливаем таймер
            if (window.timerInterval) {
                clearInterval(window.timerInterval);
            }
            
            // Показываем результат
            puzzlePage.classList.add('hidden');
            resultPage.classList.remove('hidden');
            
            resultText.textContent = success ? 'Правильно!' : 'Неправильно!';
            resultText.className = success ? 'success' : 'failure';
            
            // Обновляем рейтинг из ответа API
            if (result.newRating) {
                ratingElements.forEach(el => {
                    el.textContent = Math.round(result.newRating);
                });
            }
            
        } catch (error) {
            console.error('Error recording solution:', error);
            showError('Ошибка при записи решения: ' + error.message);
        }
    }

    function showPuzzle(puzzle) {
        // ... существующий код ...
        
        // Запускаем секундомер вместо таймера
        startStopwatch();
        
        // ... остальной код ...
    }

    // Обновляем функцию loadPuzzle для работы с реальным API
    async function loadPuzzle(username) {
        try {
            console.log('Loading puzzle for user:', username);
            
            const puzzle = await fetchWithAuth(`${window.CONFIG.API_URL}/random-puzzle/${username}`);
            
            if (!puzzle) {
                throw new Error('Не удалось получить данные задачи');
            }
            
            if (!puzzle.fen1 || !puzzle.move1 || !puzzle.move2 || !puzzle.id) {
                throw new Error('Неполные данные задачи');
            }

            // Проверяем валидность FEN и ходов
            const tempGame = new Chess();
            if (!tempGame.load(puzzle.fen1)) {
                throw new Error('Некорректная позиция');
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
            goodButton.addEventListener('click', () => {
                if (!currentPuzzle) {
                    showError('Нет текущей задачи!');
                    return;
                }
                
                // Останавливаем таймер
                if (window.timerInterval) {
                    clearInterval(window.timerInterval);
                }
                
                // Проверяем, правильный ли ответ
                const isCorrect = currentPuzzle.solution === 'Good';
                handlePuzzleResult(isCorrect);
            });
        }

        if (blunderButton) {
            blunderButton.addEventListener('click', () => {
                if (!currentPuzzle) {
                    showError('Нет текущей задачи!');
                    return;
                }
                
                // Останавливаем таймер
                if (window.timerInterval) {
                    clearInterval(window.timerInterval);
                }
                
                // Проверяем, правильный ли ответ
                const isCorrect = currentPuzzle.solution === 'Blunder';
                handlePuzzleResult(isCorrect);
            });
        }

        // Добавляем обработчик для кнопки Next
        const nextButton = document.querySelector('.next-btn');
        if (nextButton) {
            nextButton.addEventListener('click', async () => {
                try {
                    resultPage.classList.add('hidden');
                    puzzlePage.classList.remove('hidden');
                    
                    // Загружаем новую задачу
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
                    console.error('Error loading next puzzle:', err);
                    showError('Ошибка при загрузке следующей задачи: ' + err.message);
                    resultPage.classList.add('hidden');
                    startPage.classList.remove('hidden');
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

                // Проверяем формат предварительного хода (должен быть 4 символа без пробела)
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
                        const fromEval = puzzleConfig.evaluatedMove.substring(0, 2);
                        const toEval = puzzleConfig.evaluatedMove.substring(2, 4);
                        
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
                    const fromPre = puzzleConfig.preMove.substring(0, 2);
                    const toPre = puzzleConfig.preMove.substring(2, 4);
                    
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

    function drawArrow(from, to, color) {
        console.log('Drawing arrow for move:', from + to); // Добавляем лог
        
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
        
        const board = document.querySelector('#board');
        if (!board) {
            console.error('Board element not found');
            return;
        }
        
        const fromSquare = document.querySelector(`[data-square="${from}"]`);
        const toSquare = document.querySelector(`[data-square="${to}"]`);
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
        path.setAttribute("fill", color);
        path.setAttribute("opacity", "0.5");

        svg.appendChild(path);
        board.appendChild(svg);
    }

    // Вспомогательная функция для получения координат клетки
    function getSquareCoords(square) {
        const file = square.charCodeAt(0) - 'a'.charCodeAt(0);
        const rank = 8 - parseInt(square[1]);
        return { x: file, y: rank };
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

    // Заменяем showError на простой alert
    function showError(message) {
        alert(message);
    }
}); 
