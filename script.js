document.addEventListener('DOMContentLoaded', function() {
    const startPage = document.getElementById('startPage');
    const puzzlePage = document.getElementById('puzzlePage');
    const resultPage = document.getElementById('resultPage');
    const startButton = document.querySelector('.start-btn');
    const resultText = document.getElementById('resultText');
    const ratingElements = document.querySelectorAll('.rating');
    const goodButton = document.querySelector('.good-btn');
    const blunderButton = document.querySelector('.blunder-btn');
    
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
    let seconds = 180; // 3 минуты

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
    const API_URL = window.CONFIG.API_URL;

    async function fetchWithAuth(url, options = {}) {
        const tg = window.Telegram.WebApp;
        const headers = {
            ...options.headers,
            'Content-Type': 'application/json',
            'X-Telegram-Init-Data': tg.initData
        };
        
        return fetch(url, { ...options, headers });
    }

    // Функция для обновления отображения рейтинга
    async function updateRatingDisplay() {
        try {
            const response = await fetchWithAuth(`${API_URL}/user-rating/${currentUsername}`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const userRating = await response.json();
            console.log('Received user rating:', userRating);
            
            ratingElements.forEach(el => {
                el.textContent = Math.round(userRating.rating || 1500);
                el.style.color = 'black';
            });
        } catch (err) {
            console.error('Error updating rating:', err);
            ratingElements.forEach(el => {
                el.textContent = '1500';
                el.style.color = 'black';
            });
        }
    }

    // Вызываем обновление рейтинга при загрузке страницы
    updateRatingDisplay();
    
    // Обновляем рейтинг каждые 5 секунд
    setInterval(updateRatingDisplay, 5000);

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
            
            document.getElementById('timer').textContent = timeString;
            
            // Если прошло 3 минуты, останавливаем секундомер
            if (seconds >= maxTime) {
                clearInterval(window.timerInterval);
                // Автоматически отправляем текущее решение как неверное
                submitSolution(false);
            }
        }, 1000);

        return seconds;
    }

    function submitSolution(success) {
        // Останавливаем секундомер
        clearInterval(window.timerInterval);
        
        // Получаем прошедшее время в секундах
        const timeDisplay = document.getElementById('timer').textContent;
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
            
            const response = await fetchWithAuth(`${API_URL}/random-puzzle/${currentUsername}`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            currentPuzzle = await response.json();
            if (!currentPuzzle) {
                throw new Error('No puzzle received');
            }

            // Определяем, кто должен ходить из FEN позиции
            const fenParts = currentPuzzle.fen.split(' ');
            const colorToMove = fenParts[1]; // 'w' для белых, 'b' для черных
            
            // Обновляем конфигурацию
            puzzleConfig.initialFen = currentPuzzle.fen;
            puzzleConfig.preMove = currentPuzzle.move_1;
            puzzleConfig.evaluatedMove = currentPuzzle.move_2;
            // Тот, кто ходит, должен быть внизу
            puzzleConfig.orientation = colorToMove === 'w' ? 'white' : 'black';
            puzzleConfig.solution = currentPuzzle.solution;

            initializeBoard();
        } catch (err) {
            console.error('Error starting puzzle:', err);
            alert('Произошла ошибка при загрузке задачи. Попробуйте обновить страницу.');
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
                
                clearInterval(timer);
                
                try {
                    const timeSpent = Math.max(0, 180 - seconds);
                    
                    const response = await fetch(`${API_URL}/record-solution`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            username: currentUsername,
                            puzzleId: currentPuzzle.id,
                            success: currentPuzzle.solution === 'Good',
                            time: timeSpent
                        })
                    });

                    if (!response.ok) {
                        throw new Error('Network response was not ok');
                    }

                    puzzlePage.classList.add('hidden');
                    resultPage.classList.remove('hidden');
                    resultText.textContent = currentPuzzle.solution === 'Good' ? 'Correct!' : 'Wrong!';
                    resultText.style.color = currentPuzzle.solution === 'Good' ? '#4CAF50' : '#FF0000';
                    
                    await updateRatingDisplay();
                    
                } catch (err) {
                    console.error('Error recording solution:', err);
                    alert('Произошла ошибка при записи решения');
                }
            });
        } else {
            console.error('Good button not found!');
        }

        if (blunderButton) {
            blunderButton.addEventListener('click', async () => {
                if (!currentPuzzle) {
                    console.error('No current puzzle!');
                    return;
                }
                
                clearInterval(timer);
                
                try {
                    const timeSpent = Math.max(0, 180 - seconds);
                    
                    const response = await fetch(`${API_URL}/record-solution`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            username: currentUsername,
                            puzzleId: currentPuzzle.id,
                            success: currentPuzzle.solution === 'Blunder',
                            time: timeSpent
                        })
                    });

                    if (!response.ok) {
                        throw new Error('Network response was not ok');
                    }

                    puzzlePage.classList.add('hidden');
                    resultPage.classList.remove('hidden');
                    resultText.textContent = currentPuzzle.solution === 'Blunder' ? 'Correct!' : 'Wrong!';
                    resultText.style.color = currentPuzzle.solution === 'Blunder' ? '#4CAF50' : '#FF0000';
                    
                    await updateRatingDisplay();
                    
                } catch (err) {
                    console.error('Error recording solution:', err);
                    alert('Произошла ошибка при записи решения');
                }
            });
        } else {
            console.error('Blunder button not found!');
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
            const response = await fetchWithAuth(`${API_URL}/random-puzzle/${currentUsername}`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            currentPuzzle = await response.json();
            if (!currentPuzzle) {
                throw new Error('No puzzle received');
            }

            // Обновляем конфигурацию
            puzzleConfig.initialFen = currentPuzzle.fen;
            puzzleConfig.preMove = currentPuzzle.move_1;
            puzzleConfig.evaluatedMove = currentPuzzle.move_2;
            puzzleConfig.solution = currentPuzzle.solution;

            resultPage.classList.add('hidden');
            puzzlePage.classList.remove('hidden');
            
            initializeBoard(); // Здесь ориентация обновится автоматически
        } catch (err) {
            console.error('Error loading next puzzle:', err);
            alert('Произошла ошибка при загрузке следующей задачи');
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
        document.getElementById('timer').textContent = '00:00';
        
        // Очищаем предыдущую стрелку
        const oldArrow = document.querySelector('.arrow');
        if (oldArrow) {
            oldArrow.remove();
        }
        
        if (board) {
            board.destroy();
        }

        // Сначала загружаем позицию
        game.load(puzzleConfig.initialFen);

        // Делаем первый ход, чтобы определить, чей ход следующий
        const [fromSquare] = puzzleConfig.preMove.match(/.{2}/g);
        const piece = game.get(fromSquare);
        
        // Устанавливаем ориентацию: тот, кто должен ответить на ход, будет внизу
        // Если первый ход белых - черные отвечают и должны быть внизу
        // Если первый ход черных - белые отвечают и должны быть внизу
        puzzleConfig.orientation = piece.color === 'w' ? 'black' : 'white';
        
        // Возвращаем позицию в исходное состояние
        game.load(puzzleConfig.initialFen);
        
        board = Chessboard('board', {
            position: game.fen(),
            orientation: puzzleConfig.orientation,
            pieceTheme: 'https://lichess1.org/assets/piece/cburnett/{piece}.svg',
            draggable: true,
            onDragStart: function(source, piece) {
                // Разрешаем перетаскивание только после предварительного хода
                // и только для фигур того цвета, чей ход
                return game.turn() === (piece[0] === 'w' ? 'w' : 'b');
            },
            onDrop: function(source, target) {
                // Получаем фигуру, которая делает ход
                const piece = game.get(source);
                
                // Проверяем валидность хода
                const move = game.move({
                    from: source,
                    to: target,
                    promotion: 'q' // Автоматическое превращение в ферзя
                });

                // Если ход невозможен по правилам шахмат
                if (move === null) {
                    return 'snapback';
                }

                // Отменяем ход, чтобы проверить, совпадает ли он с ожидаемым
                game.undo();

                // Проверяем, совпадает ли ход с ожидаемым
                const moveString = source + target;
                if (moveString === puzzleConfig.evaluatedMove) {
                    // Делаем ход снова и обрабатываем результат
                    game.move({
                        from: source,
                        to: target,
                        promotion: 'q'
                    });
                    handlePuzzleResult(puzzleConfig.solution === 'Good');
                } else {
                    // Если ход не совпадает с ожидаемым, возвращаем фигуру
                    return 'snapback';
                }
            },
            onSnapEnd: function() {
                board.position(game.fen());
            }
        });

        // Анимация предварительного хода с задержкой
        setTimeout(() => {
            const [from, to] = puzzleConfig.preMove.match(/.{2}/g);
            
            // Делаем ход в игре
            game.move({ from, to, promotion: 'q' });
            
            // Анимируем ход на доске
            board.move(`${from}-${to}`);
            
            // После завершения анимации рисуем стрелку
            setTimeout(drawArrow, 500);
        }, 500);

        // Запускаем секундомер
        startStopwatch();
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
        // Останавливаем секундомер
        if (window.timerInterval) {
            clearInterval(window.timerInterval);
        }
        
        // Получаем прошедшее время
        const timeDisplay = document.getElementById('timer').textContent;
        const [minutes, seconds] = timeDisplay.split(':').map(Number);
        const totalSeconds = minutes * 60 + seconds;

        try {
            // Отправляем результат на сервер
            const response = await fetchWithAuth(`${API_URL}/record-solution`, {
                method: 'POST',
                body: JSON.stringify({
                    username: currentUsername,
                    puzzleId: currentPuzzle.id,
                    success: isCorrect,
                    time: totalSeconds
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            // Показываем результат
            resultText.textContent = isCorrect ? 'Right!' : 'Wrong!';
            puzzlePage.classList.add('hidden');
            resultPage.classList.remove('hidden');

            // Обновляем рейтинг
            await updateRatingDisplay();
        } catch (err) {
            console.error('Error recording solution:', err);
            alert('Произошла ошибка при сохранении результата');
        }
    }
}); 
