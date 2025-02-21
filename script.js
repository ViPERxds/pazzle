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
    let currentUsername = 'test_user'; // Замените на реальное получение имени пользователя

    const API_URL = window.location.origin + '/api';

    // Функция для обновления отображения рейтинга
    async function updateRatingDisplay() {
        try {
            const response = await fetch(`${API_URL}/user-rating/${currentUsername}`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const userRating = await response.json();
            console.log('Received user rating:', userRating);
            
            if (userRating && typeof userRating.rating === 'number') {
                const displayRating = Math.round(userRating.rating);
                ratingElements.forEach(el => {
                    el.textContent = displayRating;
                    // Добавляем цветовую индикацию изменения рейтинга
                    if (displayRating > 0) {
                        el.style.color = 'green';
                    } else if (displayRating < 0) {
                        el.style.color = 'red';
                    } else {
                        el.style.color = 'black';
                    }
                });
            }
        } catch (err) {
            console.error('Error updating rating:', err);
            ratingElements.forEach(el => {
                el.textContent = '0';
                el.style.color = 'black';
            });
        }
    }

    // Вызываем обновление рейтинга при загрузке страницы
    updateRatingDisplay();
    
    // Обновляем рейтинг каждые 5 секунд
    setInterval(updateRatingDisplay, 5000);

    function updateTimer() {
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        const display = `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
        document.querySelector('.timer').textContent = display;
    }

    function startTimer() {
        if (timer) {
            clearInterval(timer);
        }
        
        startTime = Date.now();
        timer = setInterval(() => {
            const elapsed = Math.floor((Date.now() - startTime) / 1000);
            seconds = Math.max(180 - elapsed, 0); // Обратный отсчет от 3 минут
            
            updateTimer();
            
            if (seconds <= 0) {
                clearInterval(timer);
                // Время вышло - отмечаем как неудачную попытку
                handlePuzzleResult(false);
            }
        }, 1000);
    }

    function stopTimer() {
        if (timer) {
            clearInterval(timer);
            timer = null;
        }
        return Math.floor((Date.now() - startTime) / 1000);
    }

    async function showResult(isCorrect) {
        clearInterval(timer);
        resultText.textContent = isCorrect ? 'Right!' : 'Wrong!';
        puzzlePage.classList.add('hidden');
        resultPage.classList.remove('hidden');
        
        // Ждем обновления рейтинга
        await new Promise(resolve => setTimeout(resolve, 500));
        await updateRatingDisplay();
    }

    // Добавьте обработку ошибок в fetch запросы
    async function fetchWithError(url, options = {}) {
        try {
            const response = await fetch(url, options);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return await response.json();
        } catch (err) {
            console.error('Fetch error:', err);
            throw err;
        }
    }

    // Обработчик для кнопки Good
    goodButton.addEventListener('click', async () => {
        try {
            if (!currentPuzzle) return;
            
            const response = await fetch(`${API_URL}/record-solution`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    username: currentUsername,
                    puzzleId: currentPuzzle.id || Date.now(),
                    success: currentPuzzle.solution === 'Good',
                    time: Math.floor((Date.now() - startTime) / 1000)
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            // Останавливаем таймер
            if (timer) {
                clearInterval(timer);
                timer = null;
            }

            // Показываем результат
            puzzlePage.classList.add('hidden');
            resultPage.classList.remove('hidden');
            
            resultText.textContent = currentPuzzle.solution === 'Good' ? 'Correct!' : 'Wrong!';
            resultText.style.color = currentPuzzle.solution === 'Good' ? 'green' : 'red';
            
            await updateRatingDisplay();
        } catch (err) {
            console.error('Error recording solution:', err);
            alert('Произошла ошибка при записи решения');
        }
    });

    // Обработчик для кнопки Blunder
    blunderButton.addEventListener('click', async () => {
        try {
            if (!currentPuzzle) return;
            
            const response = await fetch(`${API_URL}/record-solution`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    username: currentUsername,
                    puzzleId: currentPuzzle.id || Date.now(),
                    success: currentPuzzle.solution === 'Blunder',
                    time: Math.floor((Date.now() - startTime) / 1000)
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            // Останавливаем таймер
            if (timer) {
                clearInterval(timer);
                timer = null;
            }

            // Показываем результат
            puzzlePage.classList.add('hidden');
            resultPage.classList.remove('hidden');
            
            resultText.textContent = currentPuzzle.solution === 'Blunder' ? 'Correct!' : 'Wrong!';
            resultText.style.color = currentPuzzle.solution === 'Blunder' ? 'green' : 'red';
            
            await updateRatingDisplay();
        } catch (err) {
            console.error('Error recording solution:', err);
            alert('Произошла ошибка при записи решения');
        }
    });

    // Обработчик для кнопки Next
    document.querySelector('.next-btn').addEventListener('click', () => {
        resultPage.classList.add('hidden');
        startPage.classList.remove('hidden');
        startPuzzle(); // Загружаем следующую задачу
    });

    // Обработчик для кнопки Start
    startButton.addEventListener('click', () => {
        startPage.classList.add('hidden');
        puzzlePage.classList.remove('hidden');
        startTime = Date.now();
        startPuzzle();
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

    function initializeBoard() {
        const config = {
            draggable: false,
            position: 'start',
            orientation: 'white'
        };
        
        board = Chessboard('board', config);
        $(window).resize(() => board.resize());
    }

    // Функция для отрисовки стрелки
    function drawArrow(move) {
        if (!move) return;
        
        // Удаляем старую стрелку
        $('.arrow').remove();
        
        const [from, to] = move.match(/.{2}/g);
        const fromSquare = $(`[data-square="${from}"]`);
        const toSquare = $(`[data-square="${to}"]`);
        
        if (!fromSquare.length || !toSquare.length) return;
        
        const fromRect = fromSquare[0].getBoundingClientRect();
        const toRect = toSquare[0].getBoundingClientRect();
        
        const boardElement = $('#board');
        const boardRect = boardElement[0].getBoundingClientRect();
        
        const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        arrow.classList.add('arrow');
        arrow.style.position = 'absolute';
        arrow.style.top = '0';
        arrow.style.left = '0';
        arrow.style.width = '100%';
        arrow.style.height = '100%';
        arrow.style.pointerEvents = 'none';
        
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        
        const startX = fromRect.left - boardRect.left + fromRect.width / 2;
        const startY = fromRect.top - boardRect.top + fromRect.height / 2;
        const endX = toRect.left - boardRect.left + toRect.width / 2;
        const endY = toRect.top - boardRect.top + toRect.height / 2;
        
        path.setAttribute('d', `M${startX},${startY} L${endX},${endY}`);
        path.setAttribute('stroke', '#00ff00');
        path.setAttribute('stroke-width', '5');
        path.setAttribute('opacity', '0.5');
        path.setAttribute('marker-end', 'url(#arrowhead)');
        
        const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
        const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
        marker.setAttribute('id', 'arrowhead');
        marker.setAttribute('markerWidth', '10');
        marker.setAttribute('markerHeight', '7');
        marker.setAttribute('refX', '9');
        marker.setAttribute('refY', '3.5');
        marker.setAttribute('orient', 'auto');
        
        const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
        polygon.setAttribute('points', '0 0, 10 3.5, 0 7');
        polygon.setAttribute('fill', '#00ff00');
        
        marker.appendChild(polygon);
        defs.appendChild(marker);
        arrow.appendChild(defs);
        arrow.appendChild(path);
        
        boardElement.append(arrow);
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

    async function startPuzzle() {
        try {
            const response = await fetch(`${API_URL}/random-puzzle/${currentUsername}`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const puzzle = await response.json();
            console.log('Received puzzle:', puzzle);
            
            if (puzzle.error) {
                console.error('Puzzle error:', puzzle.error);
                return;
            }
            
            currentPuzzle = puzzle;
            
            // Устанавливаем позицию на доске
            board.position(puzzle.fen, false);
            
            // Показываем стрелку для первого хода
            setTimeout(() => {
                drawArrow(puzzle.move_1);
            }, 500);
            
            // Запускаем таймер
            startTimer();
        } catch (err) {
            console.error('Error starting puzzle:', err);
        }
    }
}); 
