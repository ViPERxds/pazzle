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
    const nextButton = document.getElementById('nextButton');
    
    // Проверяем, найдены ли элементы
    console.log('Elements found:', {
        goodButton,
        blunderButton,
        startButton,
        puzzlePage,
        resultPage
    });

    // Определяем API URL
    const API_URL = 'https://yoblogger.ru:10000/api';

    let currentPuzzle = null;
    let currentUsername = 'test_user';
    let board = null;
    let game = new Chess();
    let elapsedTime = 0;

    // Конфигурация для текущей задачи
    const puzzleConfig = {
        initialFen: '',
        preMove: '',
        evaluatedMove: '',
        orientation: 'white',
        solution: '',
        preMoveDelay: 2000
    };

    // Функция для выполнения запросов к API
    async function fetchWithAuth(url, options = {}) {
        try {
            console.log('Fetching:', url);
            
            const response = await fetch(url, options);
            
            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status}`);
            }
            
            const data = await response.json();
            return data;
        } catch (error) {
            console.error('Fetch error:', error);
            throw error;
        }
    }

    // Функция для обновления отображения рейтинга
    async function updateRatingDisplay(username) {
        try {
            // Получаем рейтинг пользователя из БД
            const ratingData = await fetchWithAuth(`${API_URL}/user-rating?username=${username}`);
            
            if (ratingData && ratingData.rating) {
                // Обновляем отображение рейтинга
                ratingElements.forEach(element => {
                    element.textContent = Math.round(ratingData.rating);
                });
                
                // Показываем изменение рейтинга
                const ratingChangeElement = document.getElementById('ratingChange');
                if (ratingChangeElement && ratingData.change !== undefined) {
                    ratingChangeElement.textContent = `${ratingData.change > 0 ? '+' : ''}${Math.round(ratingData.change)}`;
                    ratingChangeElement.className = ratingData.change > 0 ? 'success' : 'failure';
                }
                
                // Показываем новый рейтинг
                const newRatingElement = document.getElementById('newRating');
                if (newRatingElement) {
                    newRatingElement.textContent = Math.round(ratingData.rating);
                }
            }
        } catch (error) {
            console.error('Error updating rating:', error);
            // Не показываем ошибку пользователю, чтобы не мешать работе
        }
    }

    // Функция для запуска секундомера
    function startStopwatch() {
        let seconds = 0;
        let minutes = 0;
        
        // Очищаем предыдущий таймер если есть
        if (window.timerInterval) {
            clearInterval(window.timerInterval);
        }
        
        // Обновляем таймер каждую секунду
        window.timerInterval = setInterval(() => {
            seconds++;
            if (seconds >= 60) {
                minutes++;
                seconds = 0;
            }
            
            // Форматируем время
            const formattedMinutes = minutes.toString().padStart(2, '0');
            const formattedSeconds = seconds.toString().padStart(2, '0');
            
            // Обновляем отображение
            timerElement.textContent = `${formattedMinutes}:${formattedSeconds}`;
            
            // Обновляем общее время в секундах
            elapsedTime = minutes * 60 + seconds;
        }, 1000);
    }

    // Функция для отправки решения
    function submitSolution(success) {
        try {
            if (!currentPuzzle || !currentPuzzle.id) {
                console.error('No current puzzle or puzzle ID!');
                showError('Нет текущей задачи!');
                return;
            }
            
            // Создаем объект с данными для отправки
            const data = {
                puzzle_id: currentPuzzle.id,
                user_id: currentUsername,
                success: success,
                time: elapsedTime,
                complexity_id: currentPuzzle.complexity || 1
            };
            
            console.log('Sending data:', data);
            
            // Отправляем данные на сервер
            fetchWithAuth(`${API_URL}/record-solution`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(data)
            }).then(() => {
                console.log('Solution recorded successfully');
            }).catch(error => {
                console.error('Error recording solution:', error);
                // Продолжаем показывать результат даже при ошибке отправки
            });
            
            // Останавливаем таймер
            if (window.timerInterval) {
                clearInterval(window.timerInterval);
            }
            
            // Переходим к результатам
            setTimeout(() => {
                puzzlePage.classList.add('hidden');
                resultPage.classList.remove('hidden');
                
                // Показываем результат
                const resultText = document.getElementById('resultText');
                if (resultText) {
                    resultText.textContent = success ? 'Правильно!' : 'Неправильно!';
                    resultText.className = success ? 'success' : 'failure';
                }
                
                // Обновляем рейтинг
                updateRatingDisplay(currentUsername).catch(error => {
                    console.error('Error updating rating display:', error);
                });
            }, 500);
        } catch (error) {
            console.error('Error recording solution:', error);
            showError('Ошибка при записи решения: ' + error.message);
        }
    }

    // Функция для отображения задачи
    function showPuzzle(puzzle) {
        if (!puzzle) {
            console.error('No puzzle data provided');
            return;
        }
        
        // Обновляем текущую задачу
        currentPuzzle = puzzle;
        
        // Определяем, кто должен ходить из FEN позиции
        const fenParts = puzzle.fen1.split(' ');
        const colorToMove = fenParts[1];
        
        // Обновляем конфигурацию
        puzzleConfig.initialFen = puzzle.fen1;
        puzzleConfig.preMove = puzzle.move1;
        puzzleConfig.evaluatedMove = puzzle.move2;
        puzzleConfig.orientation = colorToMove === 'w' ? 'white' : 'black';
        puzzleConfig.solution = puzzle.solution;
        
        // Инициализируем доску
        initializeBoard().catch(error => {
            console.error('Error initializing board:', error);
            showError('Ошибка при инициализации доски: ' + error.message);
        });
    }

    // Функция загрузки задачи из БД
    async function loadPuzzle(username) {
        try {
            console.log('Loading puzzle for user:', username);
            
            // Получаем случайную задачу из БД через API
            const puzzle = await fetchWithAuth(`${API_URL}/random-puzzle`);
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
                // Проверяем формат хода (должен быть 4 символа без пробела)
                if (!puzzle.move1.match(/^[a-h][1-8][a-h][1-8]$/)) {
                    throw new Error('Неверный формат предварительного хода');
                }
                
                const fromPre = puzzle.move1.substring(0, 2);
                const toPre = puzzle.move1.substring(2, 4);
                
                // Проверяем, есть ли фигура на начальной позиции
                const piece = tempGame.get(fromPre);
                if (!piece) {
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
                // Проверяем формат хода (должен быть 4 символа без пробела)
                if (!puzzle.move2.match(/^[a-h][1-8][a-h][1-8]$/)) {
                    throw new Error('Неверный формат оцениваемого хода');
                }
                
                const fromEval = puzzle.move2.substring(0, 2);
                const toEval = puzzle.move2.substring(2, 4);
                
                // Проверяем, есть ли фигура на начальной позиции
                const piece = tempGame.get(fromEval);
                if (!piece) {
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

    // Инициализация кнопок
    function initializeButtons() {
        // Обработчик кнопки START
        if (startButton) {
            startButton.addEventListener('click', async () => {
                try {
                    startPage.classList.add('hidden');
                    puzzlePage.classList.remove('hidden');
                    
                    // Загружаем задачу
                    currentPuzzle = await loadPuzzle(currentUsername);
                    
                    // Показываем задачу
                    showPuzzle(currentPuzzle);
                } catch (err) {
                    console.error('Error starting puzzle:', err);
                    showError('Ошибка при загрузке задачи: ' + err.message);
                    startPage.classList.remove('hidden');
                    puzzlePage.classList.add('hidden');
                }
            });
        }

        // Обработчик кнопки "Хорошо"
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

        // Обработчик кнопки "Зевок"
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

        // Обработчик кнопки "Следующая задача"
        if (nextButton) {
            nextButton.addEventListener('click', async () => {
                try {
                    resultPage.classList.add('hidden');
                    puzzlePage.classList.remove('hidden');
                    
                    // Загружаем новую задачу
                    currentPuzzle = await loadPuzzle(currentUsername);
                    
                    // Показываем задачу
                    showPuzzle(currentPuzzle);
                } catch (err) {
                    console.error('Error loading next puzzle:', err);
                    showError('Ошибка при загрузке следующей задачи: ' + err.message);
                    resultPage.classList.add('hidden');
                    startPage.classList.remove('hidden');
                }
            });
        }
    }

    // Определяем ориентацию доски на основе FEN
    function getBoardOrientation(fen) {
        const parts = fen.split(' ');
        return parts[1] === 'w' ? 'white' : 'black';
    }

    // Инициализация шахматной доски
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
                elapsedTime = 0;
                
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

    // Функция для рисования стрелки
    function drawArrow(from, to, color) {
        console.log('Drawing arrow for move:', from + to);
        
        // Удаляем старую стрелку
        const oldArrow = document.querySelector('.arrow');
        if (oldArrow) {
            oldArrow.remove();
        }
        
        // Создаем SVG элемент
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
        
        if (!fromSquare || !toSquare) {
            console.error('Square elements not found', from, to);
            return;
        }
        
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
        path.setAttribute("fill", color || '#00ff00');
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

    // Обработчик результата задачи
    async function handlePuzzleResult(isCorrect) {
        try {
            // Останавливаем таймер
            if (window.timerInterval) {
                clearInterval(window.timerInterval);
            }
            
            // Отправляем решение
            submitSolution(isCorrect);
        } catch (error) {
            console.error('Error handling puzzle result:', error);
            showError('Ошибка при обработке результата: ' + error.message);
        }
    }

    // Заменяем showError на простой alert
    function showError(message) {
        alert(message);
    }
    
    // Инициализируем кнопки
    initializeButtons();
    
    // Обновляем рейтинг при загрузке
    updateRatingDisplay(currentUsername).catch(error => {
        console.error('Error updating initial rating display:', error);
    });
}); 
