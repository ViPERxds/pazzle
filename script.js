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
            const headers = {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            };

            const response = await fetch(url, { 
                ...options, 
                headers: {
                    ...headers,
                    ...options.headers
                }
            });

            if (!response.ok) {
                const errorText = await response.text();
                let errorMessage;
                try {
                    const errorJson = JSON.parse(errorText);
                    errorMessage = errorJson.error || `HTTP error! status: ${response.status}`;
                } catch {
                    errorMessage = errorText || `HTTP error! status: ${response.status}`;
                }
                throw new Error(errorMessage);
            }

            const data = await response.json();
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
            
            ratingElements.forEach(el => {
                el.textContent = Math.round(userRating.rating || 1500);
                el.style.color = 'black';
            });
        } catch (err) {
            console.error('Error updating rating:', err);
            ratingElements.forEach(el => {
                el.textContent = '1500';
                el.style.color = 'red';
            });
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

    // Обработчик кнопки START
    startButton.addEventListener('click', async () => {
        try {
            startPage.classList.add('hidden');
            puzzlePage.classList.remove('hidden');
            
            currentPuzzle = await fetchWithAuth(`${API_URL}/random-puzzle/${currentUsername}`);
            if (!currentPuzzle || !currentPuzzle.fen1 || !currentPuzzle.move1 || !currentPuzzle.move2) {
                throw new Error('Invalid puzzle data received');
            }

            // Определяем, кто должен ходить из FEN позиции
            const fenParts = currentPuzzle.fen1.split(' ');
            const colorToMove = fenParts[1]; // 'w' для белых, 'b' для черных
            
            // Обновляем конфигурацию
            puzzleConfig.initialFen = currentPuzzle.fen1;
            puzzleConfig.preMove = currentPuzzle.move1;
            puzzleConfig.evaluatedMove = currentPuzzle.move2;
            puzzleConfig.orientation = colorToMove === 'w' ? 'white' : 'black';
            puzzleConfig.solution = currentPuzzle.solution;

            // Сбрасываем состояние игры
            game = new Chess();
            initializeBoard();
        } catch (err) {
            console.error('Error starting puzzle:', err);
            showError('Произошла ошибка при загрузке задачи. Попробуйте обновить страницу.');
        }
    });

    // Инициализация кнопок
    function initializeButtons() {
        if (goodButton) {
            goodButton.addEventListener('click', async () => {
                if (!currentPuzzle) {
                    console.error('No current puzzle!');
                    return;
                }
                
                if (timer) {
                    clearInterval(timer);
                }
                
                try {
                    const timeDisplay = timerElement.textContent;
                    const [minutes, seconds] = timeDisplay.split(':').map(Number);
                    const totalSeconds = minutes * 60 + seconds;
                    
                    await fetchWithAuth(`${API_URL}/record-solution`, {
                        method: 'POST',
                        body: JSON.stringify({
                            username: currentUsername,
                            puzzleId: currentPuzzle.id,
                            success: true,
                            time: totalSeconds
                        })
                    });

                    puzzlePage.classList.add('hidden');
                    resultPage.classList.remove('hidden');
                    resultText.textContent = currentPuzzle.solution ? 'Correct!' : 'Wrong!';
                    resultText.style.color = currentPuzzle.solution ? '#4CAF50' : '#FF0000';
                    
                    await updateRatingDisplay(currentUsername);
                    
                } catch (err) {
                    console.error('Error recording solution:', err);
                    showError('Произошла ошибка при записи решения');
                }
            });
        }

        if (blunderButton) {
            blunderButton.addEventListener('click', async () => {
                if (!currentPuzzle) {
                    console.error('No current puzzle!');
                    return;
                }
                
                if (timer) {
                    clearInterval(timer);
                }
                
                try {
                    const timeDisplay = timerElement.textContent;
                    const [minutes, seconds] = timeDisplay.split(':').map(Number);
                    const totalSeconds = minutes * 60 + seconds;
                    
                    await fetchWithAuth(`${API_URL}/record-solution`, {
                        method: 'POST',
                        body: JSON.stringify({
                            username: currentUsername,
                            puzzleId: currentPuzzle.id,
                            success: false,
                            time: totalSeconds
                        })
                    });

                    puzzlePage.classList.add('hidden');
                    resultPage.classList.remove('hidden');
                    resultText.textContent = !currentPuzzle.solution ? 'Correct!' : 'Wrong!';
                    resultText.style.color = !currentPuzzle.solution ? '#4CAF50' : '#FF0000';
                    
                    await updateRatingDisplay(currentUsername);
                    
                } catch (err) {
                    console.error('Error recording solution:', err);
                    showError('Произошла ошибка при записи решения');
                }
            });
        }
    }

    // Вызываем инициализацию кнопок после загрузки DOM
    initializeButtons();

    document.querySelector('.next-btn').addEventListener('click', async () => {
        if (timer) {
            clearInterval(timer);
            timer = null;
        }
        
        try {
            currentPuzzle = await fetchWithAuth(`${API_URL}/random-puzzle/${currentUsername}`);
            if (!currentPuzzle || !currentPuzzle.fen1) {
                throw new Error('Invalid puzzle data received');
            }

            // Определяем, кто должен ходить из FEN позиции
            const fenParts = currentPuzzle.fen1.split(' ');
            const colorToMove = fenParts[1]; // 'w' для белых, 'b' для черных
            
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
            initializeBoard();
        } catch (err) {
            console.error('Error loading next puzzle:', err);
            showError('Произошла ошибка при загрузке следующей задачи');
        }
    });

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

        try {
            // Проверяем валидность FEN и ходов
            if (!puzzleConfig.initialFen || !game.load(puzzleConfig.initialFen)) {
                throw new Error('Invalid FEN position');
            }

            if (!puzzleConfig.preMove || !puzzleConfig.preMove.match(/^[a-h][1-8][a-h][1-8]$/)) {
                throw new Error('Invalid premove format');
            }

            board = Chessboard('board', {
                position: puzzleConfig.initialFen,
                orientation: puzzleConfig.orientation,
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
                    $(`[data-square="${target}"]`).addClass('highlight-move');
                    
                    // Проверяем валидность хода
                    const move = game.move({
                        from: source,
                        to: target,
                        promotion: 'q'
                    });

                    // Если ход невозможен по правилам шахмат
                    if (move === null) {
                        $('.highlight-square').removeClass('highlight-square');
                        $('.highlight-move').removeClass('highlight-move');
                        return 'snapback';
                    }

                    // Отменяем ход, чтобы проверить, совпадает ли он с ожидаемым
                    game.undo();

                    // Проверяем, совпадает ли ход с ожидаемым
                    const moveString = source + target;
                    if (moveString === puzzleConfig.evaluatedMove) {
                        // Делаем ход снова
                        game.move({
                            from: source,
                            to: target,
                            promotion: 'q'
                        });
                        
                        // Обновляем позицию с анимацией
                        board.position(game.fen(), true);
                        
                        setTimeout(() => {
                            $('.highlight-square').removeClass('highlight-square');
                            $('.highlight-move').removeClass('highlight-move');
                            handlePuzzleResult(puzzleConfig.solution === 'Good');
                        }, 600);
                    } else {
                        $('.highlight-square').removeClass('highlight-square');
                        $('.highlight-move').removeClass('highlight-move');
                        return 'snapback';
                    }
                },
                onSnapEnd: function() {
                    board.position(game.fen(), false);
                }
            });

            // Анимация предварительного хода с задержкой
            setTimeout(() => {
                if (!puzzleConfig.preMove) {
                    console.error('No premove defined');
                    return;
                }

                const [from, to] = puzzleConfig.preMove.match(/.{2}/g);
                if (!from || !to) {
                    console.error('Invalid premove format');
                    return;
                }
                
                // Проверяем валидность хода
                const move = game.move({ from, to, promotion: 'q' });
                if (!move) {
                    console.error('Invalid premove:', from, to);
                    showError('Ошибка: некорректный предварительный ход');
                    return;
                }
                
                // Подсвечиваем начальную и конечную клетки
                $(`[data-square="${from}"]`).addClass('highlight-square');
                $(`[data-square="${to}"]`).addClass('highlight-move');
                
                // Анимируем ход на доске
                board.position(game.fen(), true);
                
                // Убираем подсветку после завершения анимации
                setTimeout(() => {
                    $('.highlight-square').removeClass('highlight-square');
                    $('.highlight-move').removeClass('highlight-move');
                    // После завершения анимации рисуем стрелку
                    if (puzzleConfig.evaluatedMove) {
                        drawArrow();
                    }
                }, 600);
            }, 500);

            // Запускаем секундомер
            startStopwatch();
        } catch (err) {
            console.error('Error initializing board:', err);
            showError('Ошибка при инициализации доски: ' + err.message);
        }
    }

    function drawArrow() {
        console.log('Drawing arrow for move:', puzzleConfig.evaluatedMove); // Добавляем лог
        
        const [from, to] = puzzleConfig.evaluatedMove.match(/.{2}/g);
        
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
        path.setAttribute("fill", "#00ff00");
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

    // Обновляем функцию handlePuzzleResult
    async function handlePuzzleResult(isCorrect) {
        if (window.timerInterval) {
            clearInterval(window.timerInterval);
        }
        
        if (!currentPuzzle || !currentPuzzle.id) {
            console.error('No valid puzzle data');
            showError('Ошибка: нет данных о текущей задаче');
            return;
        }
        
        const timeDisplay = timerElement.textContent;
        const [minutes, seconds] = timeDisplay.split(':').map(Number);
        const totalSeconds = minutes * 60 + seconds;

        try {
            await fetchWithAuth(`${API_URL}/record-solution`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    username: currentUsername,
                    puzzleId: currentPuzzle.id,
                    success: isCorrect,
                    time: totalSeconds
                })
            });

            resultText.textContent = isCorrect ? 'Right!' : 'Wrong!';
            resultText.style.color = isCorrect ? '#4CAF50' : '#FF0000';
            puzzlePage.classList.add('hidden');
            resultPage.classList.remove('hidden');

            await updateRatingDisplay(currentUsername);
        } catch (err) {
            console.error('Error recording solution:', err);
            showError('Произошла ошибка при сохранении результата');
        }
    }

    // Заменяем showAlert на showPopup где это возможно
    function showError(message) {
        if (window.Telegram?.WebApp?.showPopup) {
            window.Telegram.WebApp.showPopup({
                message: message,
                buttons: [{type: 'close'}]
            });
        } else {
            alert(message);
        }
    }
}); 
