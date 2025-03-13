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
        fen2: '',
        move1: '',
        move2: '',
        orientation: 'white',
        solution: false
    };
    
    // Инициализация игры
    let game = new Chess();
    let board = null;
    
    // Функция инициализации доски
    function initializeBoard(puzzleConfig) {
        console.log('Initializing board with config:', puzzleConfig);
        
        // Проверяем наличие всех необходимых данных
        if (!puzzleConfig.initialFen || !puzzleConfig.move1 || !puzzleConfig.fen2 || !puzzleConfig.move2) {
            console.error('Missing required puzzle data:', puzzleConfig);
            return;
        }

        // Создаем новый экземпляр игры
        game = new Chess();
        
        // Загружаем начальную позицию и проверяем ее
        if (!game.load(puzzleConfig.initialFen)) {
            console.error('Failed to load initial position:', puzzleConfig.initialFen);
            return;
        }
        
        // Получаем координаты предварительного хода
        const [fromSquare, toSquare] = [
            puzzleConfig.move1.substring(0, 2),
            puzzleConfig.move1.substring(2, 4)
        ];
        
        // Проверяем наличие фигуры и возможность хода
        const pieceOnSquare = game.get(fromSquare);
        const legalMoves = game.moves({ verbose: true });
        
        console.log('Initial position state:', {
            fen: game.fen(),
            piece: pieceOnSquare,
            from: fromSquare,
            to: toSquare,
            turn: game.turn(),
            legalMoves: legalMoves.filter(m => m.from === fromSquare)
        });
        
        if (!pieceOnSquare) {
            console.error('No piece at starting square:', fromSquare);
            return;
        }

        // Создаем конфигурацию доски
        const config = {
            draggable: true,
            position: puzzleConfig.initialFen,
            orientation: puzzleConfig.orientation,
            onDragStart: onDragStart,
            onDrop: onDrop,
            onSnapEnd: onSnapEnd,
            pieceTheme: 'https://lichess1.org/assets/piece/cburnett/{piece}.svg'
        };

        // Создаем доску
        board = Chessboard('board', config);
        
        // Ждем немного, чтобы доска успела инициализироваться
        setTimeout(() => {
            try {
                // Проверяем возможность хода
                const moveIsLegal = legalMoves.some(m => m.from === fromSquare && m.to === toSquare);
                
                if (!moveIsLegal) {
                    console.error('Move is not legal:', {
                        from: fromSquare,
                        to: toSquare,
                        piece: pieceOnSquare,
                        legalMoves: legalMoves.filter(m => m.from === fromSquare)
                    });
                    return;
                }

                // Делаем ход
                const premove = game.move({ from: fromSquare, to: toSquare, promotion: 'q' });
                if (premove) {
                    console.log('Premove successful:', premove);
                    // Обновляем позицию на доске
                    board.position(game.fen(), false);
                    
                    // Показываем стрелку для следующего хода
                    const [move2From, move2To] = [
                        puzzleConfig.move2.substring(0, 2),
                        puzzleConfig.move2.substring(2, 4)
                    ];
                    
                    // Подробное логирование для отладки
                    console.log('Move2 details:', {
                        move2: puzzleConfig.move2,
                        from: move2From,
                        to: move2To,
                        orientation: puzzleConfig.orientation,
                        currentPosition: game.fen()
                    });
                    
                    // Проверяем, есть ли фигура на начальной позиции для move2
                    const pieceForMove2 = game.get(move2From);
                    if (!pieceForMove2) {
                        console.error('No piece at starting square for move2:', move2From);
                        console.log('Current board state:', game.fen());
                        console.log('All pieces:', game.board());
                        
                        // Пытаемся найти правильный ход
                        const legalMoves = game.moves({ verbose: true });
                        console.log('Legal moves after move1:', legalMoves);
                        
                        // Ищем ход, который ведет на целевую клетку
                        const possibleMove = legalMoves.find(m => m.to === move2To);
                        
                        if (possibleMove) {
                            console.log('Found alternative move2:', possibleMove);
                            // Используем найденный ход для отображения стрелки
                            drawArrow(possibleMove.from, possibleMove.to, 'black');
                            return;
                        }
                        
                        // Если не нашли подходящий ход, пробуем найти любой ход той же фигурой
                        const currentTurn = game.turn();
                        const figureType = move2From.charAt(0);
                        const sameTypeMoves = legalMoves.filter(m => {
                            const piece = game.get(m.from);
                            return piece && piece.type === figureType && 
                                  ((currentTurn === 'w' && piece.color === 'w') || 
                                   (currentTurn === 'b' && piece.color === 'b'));
                        });
                        
                        if (sameTypeMoves.length > 0) {
                            console.log('Using move with same piece type:', sameTypeMoves[0]);
                            drawArrow(sameTypeMoves[0].from, sameTypeMoves[0].to, 'black');
                            return;
                        }
                        
                        // Если не нашли ход той же фигурой, используем первый доступный ход
                        if (legalMoves.length > 0) {
                            console.log('Using first available move:', legalMoves[0]);
                            drawArrow(legalMoves[0].from, legalMoves[0].to, 'black');
                            return;
                        }
                    } else {
                        console.log('Piece for move2:', pieceForMove2);
                        
                        // Проверяем, является ли ход move2 легальным
                        const move2IsLegal = game.moves({ verbose: true }).some(m => 
                            m.from === move2From && m.to === move2To
                        );
                        
                        if (!move2IsLegal) {
                            console.warn('Move2 is not legal in current position:', {
                                from: move2From,
                                to: move2To,
                                legalMoves: game.moves({ verbose: true })
                            });
                            
                            // Пытаемся найти легальный ход той же фигурой
                            const legalMoves = game.moves({ verbose: true });
                            const movesWithSamePiece = legalMoves.filter(m => m.from === move2From);
                            
                            if (movesWithSamePiece.length > 0) {
                                console.log('Using alternative move with same piece:', movesWithSamePiece[0]);
                                drawArrow(movesWithSamePiece[0].from, movesWithSamePiece[0].to, 'black');
                                return;
                            }
                        }
                        
                        // Рисуем стрелку с учетом ориентации доски
                        console.log('Drawing arrow from', move2From, 'to', move2To);
                        drawArrow(move2From, move2To, 'black');
                    }
                }
            } catch (error) {
                console.error('Error making premove:', error);
                console.log('Game state:', {
                    fen: game.fen(),
                    turn: game.turn(),
                    inCheck: game.in_check(),
                    moves: game.moves()
                });
            }
        }, 100);
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
        if (move === null) {
            return 'snapback';
        }
        
        // Отменяем ход, так как мы только оцениваем ход move2
        game.undo();
        
        // Получаем ожидаемый ход move2
        const expectedMove = puzzleConfig.move2;
        const [expectedFrom, expectedTo] = [
            expectedMove.substring(0, 2),
            expectedMove.substring(2, 4)
        ];
        
        console.log('Comparing moves:', {
            userMove: source + target,
            expectedMove: expectedMove,
            userFrom: source,
            userTo: target,
            expectedFrom: expectedFrom,
            expectedTo: expectedTo,
            expectedSolution: puzzleConfig.solution
        });
        
        // Проверяем, совпадает ли ход с move2
        let moveMatches = false;
        
        // Сначала проверяем точное совпадение
        if (source + target === expectedMove) {
            console.log('Exact match with move2');
            moveMatches = true;
        } 
        // Если не совпадает точно, проверяем, совпадает ли целевая клетка
        // Это может быть случай, когда несколько фигур могут пойти на одну и ту же клетку
        else if (target === expectedTo) {
            // Проверяем, является ли это ходом той же фигурой
            const userPiece = game.get(source);
            const expectedPiece = game.get(expectedFrom);
            
            if (expectedPiece && userPiece && 
                userPiece.type === expectedPiece.type && 
                userPiece.color === expectedPiece.color) {
                console.log('Same piece type moving to the expected target square');
                moveMatches = true;
            }
        }
        
        // Определяем правильность решения на основе соответствия хода и ожидаемого решения
        // Если puzzleConfig.solution === true (Good), то правильный ответ - сделать ход
        // Если puzzleConfig.solution === false (Blunder), то правильный ответ - НЕ делать ход
        
        // Проверяем, совпадает ли ход с ожидаемым
        const moveIsCorrect = moveMatches;
        
        // Определяем правильность ответа в зависимости от значения solution
        // Если solution === true (Good), то правильный ответ - сделать ход
        // Если solution === false (Blunder), то правильный ответ - НЕ делать ход
        const isCorrect = (puzzleConfig.solution === true && moveIsCorrect) || 
                         (puzzleConfig.solution === false && !moveIsCorrect);
        
        console.log('Solution evaluation:', {
            moveMatches: moveMatches,
            moveIsCorrect: moveIsCorrect,
            expectedSolution: puzzleConfig.solution,
            isCorrect: isCorrect
        });
        
        // Отправляем результат
        submitSolution(isCorrect);
        
        return 'snapback';
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
            console.log('Updating rating display for user:', username);
            const userRating = await fetchWithAuth(`${API_URL}/api/user-rating/${username}`);
            console.log('Received user rating from API:', userRating);
            
            if (!userRating || !userRating.rating) {
                console.error('Invalid user rating data:', userRating);
                throw new Error('Некорректные данные рейтинга');
            }
            
            const rating = parseFloat(userRating.rating).toFixed(0);
            const rd = parseFloat(userRating.rd).toFixed(0);
            
            console.log('Updating rating elements with new rating:', rating);
            ratingElements.forEach(el => {
                // Сохраняем предыдущее значение для анимации
                const oldRating = el.textContent;
                
                // Обновляем значение
                el.textContent = rating;
                el.style.color = 'black';
                
                // Добавляем всплывающую подсказку с дополнительной информацией
                el.title = `Рейтинг: ${rating}\nОтклонение: ${rd}\nВолатильность: ${parseFloat(userRating.volatility).toFixed(5)}`;
                
                // Добавляем анимацию изменения рейтинга
                if (oldRating && oldRating !== rating) {
                    const isIncrease = parseInt(rating) > parseInt(oldRating);
                    el.classList.add(isIncrease ? 'rating-increase' : 'rating-decrease');
                    setTimeout(() => {
                        el.classList.remove('rating-increase', 'rating-decrease');
                    }, 2000);
                }
            });
            
            // Добавляем стили для анимации, если их еще нет
            if (!document.getElementById('rating-animation-styles')) {
                const styleEl = document.createElement('style');
                styleEl.id = 'rating-animation-styles';
                styleEl.textContent = `
                    .rating-increase {
                        animation: pulse-green 2s;
                        color: green !important;
                    }
                    .rating-decrease {
                        animation: pulse-red 2s;
                        color: red !important;
                    }
                    @keyframes pulse-green {
                        0% { transform: scale(1); }
                        50% { transform: scale(1.2); }
                        100% { transform: scale(1); }
                    }
                    @keyframes pulse-red {
                        0% { transform: scale(1); }
                        50% { transform: scale(1.2); }
                        100% { transform: scale(1); }
                    }
                `;
                document.head.appendChild(styleEl);
            }
            
            return userRating;
        } catch (err) {
            console.error('Error updating rating display:', err);
            ratingElements.forEach(el => {
                el.textContent = '1500';
                el.style.color = 'red';
                el.title = 'Ошибка при получении рейтинга: ' + err.message;
            });
            
            return {
                rating: 1500,
                rd: 350,
                volatility: 0.06
            };
        }
    }

    // Вызываем обновление рейтинга при загрузке страницы
    updateRatingDisplay(currentUsername);
    
    function startStopwatch() {
        // Очищаем предыдущий интервал если он был
        if (window.timerInterval) {
            clearInterval(window.timerInterval);
        }

        // Устанавливаем начальное время
        startTime = Date.now();

        // Обновляем таймер сразу и затем каждую секунду
        updateTimer();
        window.timerInterval = setInterval(updateTimer, 1000);

        // Устанавливаем максимальное время (3 минуты)
        const maxTime = 180; // в секундах
        
        // Устанавливаем таймер для автоматического завершения через maxTime секунд
        window.timeoutTimer = setTimeout(() => {
            clearInterval(window.timerInterval);
            // Автоматически отправляем текущее решение как неверное
            handlePuzzleResult(false);
        }, maxTime * 1000);
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
            if (window.timeoutTimer) {
                clearTimeout(window.timeoutTimer);
            }

            // Получаем время решения
            const elapsedTime = Math.floor((Date.now() - startTime) / 1000);

            console.log('Sending solution:', {
                username: currentUsername,
                puzzleId: currentPuzzle.id,
                success: success,
                successType: typeof success,
                time: elapsedTime,
                expectedSolution: puzzleConfig.solution,
                expectedSolutionType: typeof puzzleConfig.solution,
                currentPuzzleSolution: currentPuzzle.solution,
                currentPuzzleSolutionType: typeof currentPuzzle.solution
            });

            // Получаем текущий рейтинг пользователя
            console.log('Fetching current user rating for:', currentUsername);
            const userRating = await fetchWithAuth(`${API_URL}/api/user-rating/${currentUsername}`);
            console.log('Current user rating received:', userRating);
            
            // Проверяем, что получили корректные данные рейтинга
            if (!userRating || !userRating.rating || isNaN(parseFloat(userRating.rating)) || 
                !userRating.rd || isNaN(parseFloat(userRating.rd)) ||
                !userRating.volatility || isNaN(parseFloat(userRating.volatility))) {
                console.error('Invalid user rating data received:', userRating);
                showError('Получены некорректные данные рейтинга пользователя');
                return;
            }
            
            // Получаем рейтинг задачи
            const puzzleRating = parseFloat(currentPuzzle.rating);
            const puzzleRD = parseFloat(currentPuzzle.rd);
            const puzzleVolatility = parseFloat(currentPuzzle.volatility);
            
            // Проверяем, что получили корректные данные рейтинга задачи
            if (isNaN(puzzleRating) || isNaN(puzzleRD) || isNaN(puzzleVolatility)) {
                console.error('Invalid puzzle rating data:', {
                    rating: currentPuzzle.rating,
                    rd: currentPuzzle.rd,
                    volatility: currentPuzzle.volatility
                });
                showError('Некорректные данные рейтинга задачи');
                return;
            }
            
            console.log('Current puzzle rating:', {
                rating: puzzleRating,
                rd: puzzleRD,
                volatility: puzzleVolatility
            });
            
            // Рассчитываем новый рейтинг пользователя по системе Glicko-2
            console.log('Calculating new user rating...');
            const newUserRatingData = updateRating(
                parseFloat(userRating.rating),
                parseFloat(userRating.rd),
                parseFloat(userRating.volatility),
                puzzleRating,
                puzzleRD,
                success
            );
            
            // Проверяем результат расчета рейтинга пользователя
            if (!newUserRatingData || !newUserRatingData.rating || isNaN(newUserRatingData.rating)) {
                console.error('Invalid new user rating calculation result:', newUserRatingData);
                showError('Ошибка при расчете нового рейтинга пользователя');
                return;
            }
            
            // Рассчитываем новый рейтинг задачи (только для логирования, не будет обновляться на сервере)
            console.log('Calculating new puzzle rating (for logging only)...');
            const newPuzzleRatingData = updatePuzzleRating(
                puzzleRating,
                puzzleRD,
                puzzleVolatility,
                parseFloat(userRating.rating),
                parseFloat(userRating.rd),
                success
            );
            
            // Проверяем результат расчета рейтинга задачи
            if (!newPuzzleRatingData || !newPuzzleRatingData.rating || isNaN(newPuzzleRatingData.rating)) {
                console.error('Invalid new puzzle rating calculation result:', newPuzzleRatingData);
                showError('Ошибка при расчете нового рейтинга задачи');
                return;
            }
            
            console.log('Rating calculation results:', {
                user: {
                    oldRating: userRating.rating,
                    newRating: newUserRatingData.rating,
                    oldRD: userRating.rd,
                    newRD: newUserRatingData.rd,
                    oldVolatility: userRating.volatility,
                    newVolatility: newUserRatingData.volatility,
                    difference: newUserRatingData.rating - parseFloat(userRating.rating)
                },
                puzzle: {
                    oldRating: puzzleRating,
                    newRating: newPuzzleRatingData.rating,
                    oldRD: puzzleRD,
                    newRD: newPuzzleRatingData.rd,
                    oldVolatility: puzzleVolatility,
                    newVolatility: newPuzzleRatingData.volatility,
                    difference: newPuzzleRatingData.rating - puzzleRating,
                    note: 'Рейтинг задачи не обновляется на сервере'
                },
                success: success
            });

            // Подготавливаем данные для отправки на сервер
            const requestData = {
                username: currentUsername,
                puzzleId: currentPuzzle.id,
                success: success,
                time: elapsedTime,
                userRating: {
                    rating: newUserRatingData.rating.toFixed(8),
                    rd: newUserRatingData.rd.toFixed(8),
                    volatility: newUserRatingData.volatility.toFixed(8)
                },
                puzzleRating: {
                    rating: newPuzzleRatingData.rating.toFixed(8),
                    rd: newPuzzleRatingData.rd.toFixed(8),
                    volatility: newPuzzleRatingData.volatility.toFixed(8)
                }
            };
            
            console.log('Sending data to server:', requestData);

            // Отправляем результат на сервер
            const result = await fetchWithAuth(`${API_URL}/api/record-solution`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestData)
            });

            console.log('Solution recorded, server response:', result);
            console.log('Server response details:', {
                status: result.status,
                message: result.message,
                userRating: result.userRating,
                puzzleRating: result.puzzleRating,
                note: 'Сервер возвращает оригинальный рейтинг задачи, а не обновленный'
            });

            // Принудительно обновляем рейтинг в элементах интерфейса
            const newRating = parseFloat(newUserRatingData.rating).toFixed(0);
            const newRD = parseFloat(newUserRatingData.rd).toFixed(0);
            
            console.log('Updating rating elements directly with new rating:', newRating);
            ratingElements.forEach(el => {
                // Сохраняем предыдущее значение для анимации
                const oldRating = el.textContent;
                
                // Обновляем значение
                el.textContent = newRating;
                el.style.color = 'black';
                el.title = `Рейтинг: ${newRating}\nОтклонение: ${newRD}\nВолатильность: ${parseFloat(newUserRatingData.volatility).toFixed(5)}`;
                
                // Добавляем анимацию изменения рейтинга
                if (oldRating && oldRating !== newRating) {
                    const isIncrease = parseInt(newRating) > parseInt(oldRating);
                    el.classList.add(isIncrease ? 'rating-increase' : 'rating-decrease');
                    setTimeout(() => {
                        el.classList.remove('rating-increase', 'rating-decrease');
                    }, 2000);
                }
            });
            
            // Также обновляем через API для синхронизации
            console.log('Updating rating display after solution submission');
            const updatedRating = await updateRatingDisplay(currentUsername);
            console.log('Rating display updated with new rating:', updatedRating);

            // Показываем результат
            puzzlePage.classList.add('hidden');
            resultPage.classList.remove('hidden');
            
            // Отображаем результат в зависимости от того, совпадает ли ответ пользователя с ожидаемым решением
            resultText.textContent = success ? 'Правильно!' : 'Неправильно!';
            resultText.className = success ? 'result success' : 'result failure';

            // Обновляем отображение рейтинга на странице результата
            const resultPageRating = document.querySelector('#resultPage .rating');
            if (resultPageRating) {
                resultPageRating.textContent = newRating;
                resultPageRating.style.color = success ? '#2E7D32' : '#C62828';
            }

            // Удаляем существующий элемент с изменением рейтинга, если он есть
            const existingRatingChange = document.querySelector('.rating-change');
            if (existingRatingChange) {
                existingRatingChange.remove();
            }

            console.log('Result displayed:', {
                userAnswer: success,
                expectedSolution: puzzleConfig.solution,
                isCorrect: success,
                ratingChange: newUserRatingData.rating - parseFloat(userRating.rating)
            });

        } catch (error) {
            console.error('Error submitting solution:', error);
            showError('Ошибка при отправке решения: ' + error.message);
        }
    }

    // Функция для проверки и исправления ходов
    function validateAndFixMoves(puzzle) {
        console.log('Validating moves for puzzle:', puzzle);
        
        // Создаем временный экземпляр игры для проверки
        const tempGame = new Chess();
        
        // Загружаем начальную позицию
        if (!tempGame.load(puzzle.fen1)) {
            console.error('Invalid FEN1:', puzzle.fen1);
            return false;
        }
        
        // Проверяем move1
        const [move1From, move1To] = [
            puzzle.move1.substring(0, 2),
            puzzle.move1.substring(2, 4)
        ];
        
        // Проверяем наличие фигуры на начальной позиции для move1
        const pieceForMove1 = tempGame.get(move1From);
        if (!pieceForMove1) {
            console.error('No piece at starting square for move1:', move1From);
            
            // Пытаемся найти правильный ход
            const legalMoves = tempGame.moves({ verbose: true });
            const possibleMove = legalMoves.find(m => m.to === move1To);
            
            if (possibleMove) {
                console.log('Found alternative move1:', possibleMove);
                puzzle.move1 = possibleMove.from + possibleMove.to;
            } else {
                console.error('Could not find alternative move1');
                return false;
            }
        }
        
        // Делаем ход move1
        const move1Result = tempGame.move({
            from: puzzle.move1.substring(0, 2),
            to: puzzle.move1.substring(2, 4),
            promotion: 'q'
        });
        
        if (!move1Result) {
            console.error('Move1 is not legal:', puzzle.move1);
            return false;
        }
        
        // Проверяем соответствие fen2
        if (puzzle.fen2 !== tempGame.fen()) {
            console.warn('FEN2 mismatch, updating:', {
                original: puzzle.fen2,
                corrected: tempGame.fen()
            });
            puzzle.fen2 = tempGame.fen();
        }
        
        // Проверяем move2
        const [move2From, move2To] = [
            puzzle.move2.substring(0, 2),
            puzzle.move2.substring(2, 4)
        ];
        
        // Проверяем наличие фигуры на начальной позиции для move2
        const pieceForMove2 = tempGame.get(move2From);
        if (!pieceForMove2) {
            console.error('No piece at starting square for move2:', move2From);
            
            // Пытаемся найти правильный ход
            const legalMoves = tempGame.moves({ verbose: true });
            console.log('Legal moves after move1:', legalMoves);
            
            // Ищем ход, который ведет на целевую клетку
            const possibleMove = legalMoves.find(m => m.to === move2To);
            
            if (possibleMove) {
                console.log('Found alternative move2:', possibleMove);
                puzzle.move2 = possibleMove.from + possibleMove.to;
            } else {
                console.error('Could not find alternative move2');
                return false;
            }
        }
        
        // Проверяем, является ли ход move2 легальным
        const move2IsLegal = tempGame.moves({ verbose: true }).some(m => 
            m.from === puzzle.move2.substring(0, 2) && m.to === puzzle.move2.substring(2, 4)
        );
        
        if (!move2IsLegal) {
            console.error('Move2 is not legal:', puzzle.move2);
            
            // Пытаемся найти правильный ход
            const legalMoves = tempGame.moves({ verbose: true });
            
            // Ищем ход той же фигурой
            const sameTypeMoves = legalMoves.filter(m => 
                tempGame.get(m.from).type === tempGame.get(puzzle.move2.substring(0, 2)).type
            );
            
            if (sameTypeMoves.length > 0) {
                console.log('Found alternative move2 with same piece type:', sameTypeMoves[0]);
                puzzle.move2 = sameTypeMoves[0].from + sameTypeMoves[0].to;
            } else if (legalMoves.length > 0) {
                console.log('Using first legal move as alternative move2:', legalMoves[0]);
                puzzle.move2 = legalMoves[0].from + legalMoves[0].to;
            } else {
                console.error('No legal moves available for move2');
                return false;
            }
        }
        
        console.log('Moves validated and fixed:', {
            move1: puzzle.move1,
            move2: puzzle.move2,
            fen1: puzzle.fen1,
            fen2: puzzle.fen2
        });
        
        return true;
    }

    // Функция для отображения задачи
    async function showPuzzle(puzzle) {
        try {
            console.log('Showing puzzle:', puzzle);
            
            // Сохраняем текущую задачу
            currentPuzzle = puzzle;
            
            // Сохраняем конфигурацию задачи
            puzzleConfig = {
                initialFen: puzzle.fen1,
                move1: puzzle.move1,
                fen2: puzzle.fen2,
                move2: puzzle.move2,
                solution: puzzle.solution === 'Good',
                orientation: puzzle.color ? 'white' : 'black'
            };
            
            console.log('Board orientation:', puzzleConfig.orientation);
            
            // Инициализируем доску
            initializeBoard(puzzleConfig);
            
            // Отображаем страницу с задачей
            startPage.classList.add('hidden');
            puzzlePage.classList.remove('hidden');
            resultPage.classList.add('hidden');
            
            // Запускаем таймер
            startStopwatch();
            
            console.log('Puzzle displayed successfully');
        } catch (error) {
            console.error('Error showing puzzle:', error);
            showError('Ошибка при отображении задачи: ' + error.message);
        }
    }

    // Функция для обновления таймера
    function updateTimer() {
        if (!startTime) return;
        
        const elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);
        const minutes = Math.floor(elapsedSeconds / 60);
        const seconds = elapsedSeconds % 60;
        
        timerElement.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }

    // Функция для поиска правильного хода на основе FEN и целевого поля
    function findCorrectMove(fen, targetSquare, pieces) {
        const game = new Chess(fen);
        const moves = game.moves({ verbose: true });
        
        // Ищем ход, который ведет на целевое поле
        const possibleMove = moves.find(m => m.to === targetSquare);
        if (possibleMove) {
            return possibleMove.from + possibleMove.to;
        }
        return null;
    }

    // Улучшенная функция загрузки задачи
    async function loadPuzzle(username) {
        try {
            console.log('Loading puzzle for user:', username);
            
            // Получаем задачу через API
            const puzzle = await fetchWithAuth(`${API_URL}/api/random-puzzle/${username}`);
            
            // Подробное логирование полученных данных
            console.log('Raw puzzle data:', puzzle);
            console.log('Solution from database:', {
                value: puzzle.solution,
                type: typeof puzzle.solution,
                boolValue: Boolean(puzzle.solution)
            });
            
            if (!puzzle) {
                throw new Error('Не удалось получить данные задачи');
            }
            
            // Проверяем FEN на корректность
            const tempGame = new Chess();
            if (!puzzle.fen1 || !tempGame.load(puzzle.fen1)) {
                console.error('Invalid or missing FEN position:', puzzle.fen1);
                throw new Error('Неверный формат позиции');
            }

            // Проверяем наличие фигуры для move1
            const [fromSquare, toSquare] = [
                puzzle.move1.substring(0, 2),
                puzzle.move1.substring(2, 4)
            ];
            
            const pieceOnStart = tempGame.get(fromSquare);
            if (!pieceOnStart) {
                console.error('No piece at starting square for move1:', {
                    square: fromSquare,
                    move: puzzle.move1,
                    fen: puzzle.fen1
                });
                throw new Error(`Неверные данные хода: нет фигуры на ${fromSquare}`);
            }

            // Делаем ход move1 и проверяем fen2
            const move1Result = tempGame.move({
                from: fromSquare,
                to: toSquare,
                promotion: 'q'
            });

            if (!move1Result) {
                console.error('Move1 is not legal:', {
                    move: puzzle.move1,
                    fen: puzzle.fen1
                });
                throw new Error('Неверные данные хода: ход невозможен');
            }

            // Проверяем соответствие fen2
            const expectedFen2 = tempGame.fen();
            if (puzzle.fen2 !== expectedFen2) {
                console.error('FEN2 mismatch:', {
                    received: puzzle.fen2,
                    expected: expectedFen2
                });
                // Исправляем fen2
                puzzle.fen2 = expectedFen2;
            }

            // Проверяем возможность хода move2
            const [move2From, move2To] = [
                puzzle.move2.substring(0, 2),
                puzzle.move2.substring(2, 4)
            ];

            const pieceForMove2 = tempGame.get(move2From);
            if (!pieceForMove2) {
                console.error('No piece at starting square for move2:', {
                    square: move2From,
                    move: puzzle.move2,
                    fen: expectedFen2
                });
                throw new Error(`Неверные данные хода: нет фигуры на ${move2From}`);
            }

            // Проверяем легальность хода move2
            const move2IsLegal = tempGame.moves({ verbose: true }).some(m => 
                m.from === move2From && m.to === move2To
            );

            if (!move2IsLegal) {
                console.error('Move2 is not legal:', {
                    move: puzzle.move2,
                    fen: expectedFen2,
                    legalMoves: tempGame.moves({ verbose: true })
                });
                throw new Error('Неверные данные хода: ход невозможен');
            }

            // Сохраняем текущую задачу
            currentPuzzle = puzzle;
            
            // Показываем задачу (функция showPuzzle также запускает таймер и показывает страницу с задачей)
            await showPuzzle(puzzle);
            
        } catch (err) {
            console.error('Error loading puzzle:', err);
            showError('Ошибка при загрузке задачи: ' + err.message);
        }
    }

    // Добавляем обработчики событий
    startButton.addEventListener('click', () => loadPuzzle(currentUsername));
    goodButton.addEventListener('click', () => {
        // Если puzzleConfig.solution === true (Good), то нажатие на Good - правильный ответ
        // Если puzzleConfig.solution === false (Blunder), то нажатие на Good - неправильный ответ
        
        // Проверяем, что puzzleConfig существует
        if (!puzzleConfig) {
            console.error('Missing puzzleConfig in goodButton handler');
            showError('Ошибка: отсутствуют данные задачи');
            return;
        }
        
        // Определяем правильность ответа
        // Если solution === true, то нажатие на Good - правильный ответ
        // Если solution === false, то нажатие на Good - неправильный ответ
        const isCorrect = puzzleConfig.solution === true;
        
        console.log('Good button clicked:', {
            expectedSolution: puzzleConfig.solution,
            solutionType: typeof puzzleConfig.solution,
            isCorrect: isCorrect,
            currentPuzzle: currentPuzzle ? {
                id: currentPuzzle.id,
                solution: currentPuzzle.solution,
                solutionType: typeof currentPuzzle.solution
            } : null
        });
        
        submitSolution(isCorrect);
    });
    blunderButton.addEventListener('click', () => {
        // Если puzzleConfig.solution === false (Blunder), то нажатие на Blunder - правильный ответ
        // Если puzzleConfig.solution === true (Good), то нажатие на Blunder - неправильный ответ
        
        // Проверяем, что puzzleConfig существует
        if (!puzzleConfig) {
            console.error('Missing puzzleConfig in blunderButton handler');
            showError('Ошибка: отсутствуют данные задачи');
            return;
        }
        
        // Определяем правильность ответа
        // Если solution === false, то нажатие на Blunder - правильный ответ
        // Если solution === true, то нажатие на Blunder - неправильный ответ
        const isCorrect = puzzleConfig.solution === false;
        
        console.log('Blunder button clicked:', {
            expectedSolution: puzzleConfig.solution,
            solutionType: typeof puzzleConfig.solution,
            isCorrect: isCorrect,
            currentPuzzle: currentPuzzle ? {
                id: currentPuzzle.id,
                solution: currentPuzzle.solution,
                solutionType: typeof currentPuzzle.solution
            } : null
        });
        
        submitSolution(isCorrect);
    });
    
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
            
            // Проверяем, что puzzleConfig существует
            if (!puzzleConfig) {
                console.error('Missing puzzleConfig in handlePuzzleResult');
                showError('Ошибка: отсутствуют данные задачи');
                return;
            }
            
            console.log('Handling puzzle result:', {
                userAnswer: isCorrect,
                expectedSolution: puzzleConfig.solution
            });
            
            // Отправляем решение
            await submitSolution(isCorrect);
        } catch (error) {
            console.error('Error handling puzzle result:', error);
            showError('Ошибка при обработке результата: ' + error.message);
        }
    }

    // Добавляем обработчик для кнопки анализа
    document.querySelector('.analyze-btn').addEventListener('click', () => {
        // Проверяем наличие необходимых данных
        if (!puzzleConfig || !puzzleConfig.move1 || !puzzleConfig.initialFen) {
            console.error('Missing required data for analysis:', puzzleConfig);
            showError('Недостаточно данных для анализа');
            return;
        }
        
        try {
            // Создаем временный экземпляр игры для анализа
            const tempGame = new Chess();
            
            // Загружаем начальную позицию
            if (!tempGame.load(puzzleConfig.initialFen)) {
                console.error('Invalid initial FEN:', puzzleConfig.initialFen);
                showError('Неверный формат позиции');
                return;
            }
            
            // Получаем координаты хода move1
            const [fromSquare, toSquare] = [
                puzzleConfig.move1.substring(0, 2),
                puzzleConfig.move1.substring(2, 4)
            ];
            
            // Проверяем наличие фигуры
            const pieceOnSquare = tempGame.get(fromSquare);
            if (!pieceOnSquare) {
                console.error('No piece at starting square:', fromSquare);
                
                // Пытаемся найти правильный ход
                const legalMoves = tempGame.moves({ verbose: true });
                const possibleMove = legalMoves.find(m => m.to === toSquare);
                
                if (possibleMove) {
                    console.log('Found alternative move for analysis:', possibleMove);
                    // Делаем найденный ход
                    tempGame.move({ from: possibleMove.from, to: possibleMove.to, promotion: 'q' });
                } else {
                    showError('Не удалось найти правильный ход для анализа');
                    return;
                }
            } else {
                // Делаем ход
                const moveResult = tempGame.move({ from: fromSquare, to: toSquare, promotion: 'q' });
                
                if (!moveResult) {
                    console.error('Move is not legal:', { from: fromSquare, to: toSquare });
                    showError('Ход невозможен');
                    return;
                }
            }
            
            // Получаем FEN после хода и форматируем его для URL
            const fen = tempGame.fen().replace(/ /g, '_');
            
            // Используем ориентацию доски из конфигурации
            const orientation = puzzleConfig.orientation;
            
            // Получаем информацию о ходе move2 для отображения в анализе
            const [move2From, move2To] = [
                puzzleConfig.move2.substring(0, 2),
                puzzleConfig.move2.substring(2, 4)
            ];
            
            // Проверяем, есть ли фигура на начальной позиции для move2
            const pieceForMove2 = tempGame.get(move2From);
            let move2Info = '';
            
            if (pieceForMove2) {
                // Проверяем, является ли ход move2 легальным
                const move2IsLegal = tempGame.moves({ verbose: true }).some(m => 
                    m.from === move2From && m.to === move2To
                );
                
                if (move2IsLegal) {
                    // Добавляем информацию о ходе move2 в URL
                    move2Info = `&arrow=${move2From}${move2To}`;
                }
            }
            
            console.log('Opening analysis with FEN:', fen, 'orientation:', orientation, 'move2:', move2Info);
            
            // Открываем страницу анализа на lichess с правильной ориентацией и стрелкой для хода move2
            window.open(`https://lichess.org/analysis/${fen}?color=${orientation === 'white' ? 'white' : 'black'}${move2Info}`, '_blank');
        } catch (error) {
            console.error('Error in analyze function:', error);
            showError('Ошибка при анализе: ' + error.message);
        }
    });

    // Функция для отрисовки стрелок
    function drawArrow(from, to, color) {
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
        
        const board = document.querySelector('#board');
        if (!board) {
            console.error('Board element not found');
            return;
        }
        
        // Получаем элементы клеток
        const fromSquare = document.querySelector(`[data-square="${from}"]`);
        const toSquare = document.querySelector(`[data-square="${to}"]`);
        
        if (!fromSquare || !toSquare) {
            console.error('Square elements not found:', { from, to, fromElement: fromSquare, toElement: toSquare });
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

        console.log('Arrow coordinates:', { 
            from: { x: x1, y: y1, square: from, rect: fromRect },
            to: { x: x2, y: y2, square: to, rect: toRect },
            board: boardRect
        });

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

    // Функция для отображения ошибок
    function showError(message) {
        // Показываем ошибку пользователю
        alert(message);
    }

    // Реализация системы рейтинга Glicko-2
    // Константы для системы Glicko-2
    const TAU = 0.5;  // Разумное значение для большинства применений
    const EPS = 1e-6;  // Допуск для сходимости итераций

    // Вспомогательная функция, зависящая от отклонения рейтинга
    function g(phi) {
        return 1 / Math.sqrt(1 + 3 * phi * phi / (Math.PI * Math.PI));
    }

    // Функция ожидаемой доли очков при игре против рейтинга mu_j и отклонения phi_j
    function E(mu, mu_j, phi_j) {
        return 1 / (1 + Math.exp(-g(phi_j) * (mu - mu_j)));
    }

    // Вспомогательная функция для итеративной процедуры
    function f(x, a, delta_sq, phi_sq, v) {
        const ex = Math.exp(x);
        return (ex * (delta_sq - phi_sq - v - ex)) / (2 * (phi_sq + v + ex) * (phi_sq + v + ex)) - (x - a) / (TAU * TAU);
    }

    // Итеративная процедура для нахождения нового значения изменчивости
    function convergeIterations(a, delta_sq, phi_sq, v) {
        // Инициализация интервала
        let A = a;
        let B = a - TAU * Math.log(1 / delta_sq - phi_sq - v);
        let fA = f(A, a, delta_sq, phi_sq, v);
        let fB = f(B, a, delta_sq, phi_sq, v);
        
        // Итерации до сходимости
        while (Math.abs(B - A) > EPS) {
            const C = A + (A - B) * fA / (fB - fA);
            const fC = f(C, a, delta_sq, phi_sq, v);
            if (fC * fB <= 0) {
                A = B;
                fA = fB;
            } else {
                fA /= 2;
            }
            B = C;
            fB = fC;
        }
        
        return Math.exp(A / 2);
    }

    // Основная функция для расчета нового рейтинга по системе Glicko-2
    function calculateGlicko2(mu, phi, mu_j_list, phi_j_list, s_list, sys_val) {
        console.log('Starting Glicko-2 calculation with:', {
            mu, phi, mu_j_list, phi_j_list, s_list, sys_val
        });
        
        // Проверяем входные данные
        if (isNaN(mu) || isNaN(phi) || !Array.isArray(mu_j_list) || !Array.isArray(phi_j_list) || !Array.isArray(s_list)) {
            console.error('Invalid input data for Glicko-2 calculation:', {
                mu: isNaN(mu) ? 'NaN' : mu,
                phi: isNaN(phi) ? 'NaN' : phi,
                mu_j_list: Array.isArray(mu_j_list) ? mu_j_list : typeof mu_j_list,
                phi_j_list: Array.isArray(phi_j_list) ? phi_j_list : typeof phi_j_list,
                s_list: Array.isArray(s_list) ? s_list : typeof s_list
            });
            
            // Возвращаем исходные значения в случае ошибки
            return {
                rating: mu,
                rd: phi,
                volatility: sys_val
            };
        }
        
        // 1. Конвертация в шкалу Glicko-2
        const original_mu = mu;
        const original_phi = phi;
        
        mu = (mu - 1500) / 173.7178;
        phi = phi / 173.7178;
        
        // Конвертируем рейтинги соперников в шкалу Glicko-2
        const mu_j_list_converted = mu_j_list.map(r => (r - 1500) / 173.7178);
        const phi_j_list_converted = phi_j_list.map(rd => rd / 173.7178);
        
        console.log('Converted to Glicko-2 scale:', {
            original_mu,
            original_phi,
            mu, 
            phi, 
            mu_j_list_converted, 
            phi_j_list_converted
        });
        
        // 2. Вспомогательные вычисления
        const phi_sq = phi * phi;
        
        // Вычисляем v (предварительная проверка на пустые списки)
        if (mu_j_list.length === 0) {
            console.log('No opponents, returning original values');
            // Если нет игр, возвращаем исходные значения
            return {
                rating: original_mu,
                rd: original_phi,
                volatility: sys_val
            };
        }
        
        // Вычисляем v
        let v_sum = 0;
        const g_values = [];
        const e_values = [];
        
        for (let i = 0; i < mu_j_list.length; i++) {
            const g_phi_j = g(phi_j_list_converted[i]);
            const e_mu_mu_j = E(mu, mu_j_list_converted[i], phi_j_list_converted[i]);
            
            g_values.push(g_phi_j);
            e_values.push(e_mu_mu_j);
            
            console.log(`Opponent ${i}:`, {
                mu_j: mu_j_list[i],
                phi_j: phi_j_list[i],
                mu_j_converted: mu_j_list_converted[i],
                phi_j_converted: phi_j_list_converted[i],
                g_phi_j,
                e_mu_mu_j,
                score: s_list[i]
            });
            
            v_sum += g_phi_j * g_phi_j * e_mu_mu_j * (1 - e_mu_mu_j);
        }
        
        const v = 1 / v_sum;
        
        console.log('Calculated v:', v, 'v_sum:', v_sum, 'g_values:', g_values, 'e_values:', e_values);
        
        // Вычисляем delta
        let delta_sum = 0;
        for (let i = 0; i < mu_j_list.length; i++) {
            const g_phi_j = g_values[i];
            const e_mu_mu_j = e_values[i];
            const score = s_list[i];
            const term = g_phi_j * (score - e_mu_mu_j);
            
            console.log(`Delta term ${i}:`, {
                g_phi_j,
                score,
                e_mu_mu_j,
                term
            });
            
            delta_sum += term;
        }
        
        const delta = v * delta_sum;
        const delta_sq = delta * delta;
        
        console.log('Calculated delta:', delta, 'delta_sq:', delta_sq, 'delta_sum:', delta_sum);
        
        // 3. Итерации для нахождения новой изменчивости
        const a = Math.log(sys_val * sys_val);
        console.log('Starting volatility iteration with a:', a, 'sys_val:', sys_val);
        
        const new_sys_val = convergeIterations(a, delta_sq, phi_sq, v);
        
        console.log('New volatility:', new_sys_val);
        
        // 4. Обновление отклонения рейтинга
        const new_phi_star = Math.sqrt(phi_sq + new_sys_val * new_sys_val);
        
        // Формула для нового отклонения рейтинга
        const new_phi = 1 / Math.sqrt(1 / (new_phi_star * new_phi_star) + 1 / v);
        
        console.log('New phi_star:', new_phi_star, 'new_phi:', new_phi);
        
        // 5. Обновление рейтинга
        let new_mu = mu;
        
        // Если есть результаты игр, обновляем рейтинг
        if (s_list.length > 0) {
            let sum_term = 0;
            for (let i = 0; i < mu_j_list.length; i++) {
                const g_phi_j = g_values[i];
                const e_mu_mu_j = e_values[i];
                const score = s_list[i];
                const term = g_phi_j * (score - e_mu_mu_j);
                
                console.log(`Rating update term ${i}:`, {
                    g_phi_j,
                    score,
                    e_mu_mu_j,
                    term
                });
                
                sum_term += term;
            }
            
            const rating_change = new_phi * new_phi * sum_term;
            new_mu = mu + rating_change;
            
            console.log('Rating update calculation:', {
                sum_term,
                new_phi_squared: new_phi * new_phi,
                rating_change,
                old_mu: mu,
                new_mu
            });
        }
        
        // 6. Конвертация обратно в шкалу Glicko
        const new_rating = 173.7178 * new_mu + 1500;
        const new_rd = 173.7178 * new_phi;
        
        console.log('Final result:', {
            original_rating: original_mu,
            new_rating,
            rating_change: new_rating - original_mu,
            original_rd: original_phi,
            new_rd,
            rd_change: new_rd - original_phi,
            original_volatility: sys_val,
            new_volatility: new_sys_val
        });
        
        return {
            rating: new_rating,
            rd: new_rd,
            volatility: new_sys_val
        };
    }

    // Упрощенная функция для обновления рейтинга после одной игры
    function updateRating(userRating, userRD, userVolatility, puzzleRating, puzzleRD, success) {
        // Конвертируем успех в очки (1 - победа, 0 - поражение)
        const score = success ? 1 : 0;
        
        console.log('Calculating new user rating with:', {
            userRating, userRD, userVolatility, puzzleRating, puzzleRD, success, score
        });
        
        // Вызываем основную функцию с одним соперником
        const result = calculateGlicko2(
            userRating,
            userRD,
            [puzzleRating],
            [puzzleRD],
            [score],
            userVolatility
        );
        
        console.log('New user rating calculated:', result);
        return result;
    }

    // Функция для расчета нового рейтинга задачи
    function updatePuzzleRating(puzzleRating, puzzleRD, puzzleVolatility, userRating, userRD, success) {
        // Инвертируем результат для задачи (если пользователь выиграл, задача проиграла)
        const puzzleScore = success ? 0 : 1;
        
        console.log('Calculating new puzzle rating with:', {
            puzzleRating, puzzleRD, puzzleVolatility, userRating, userRD, success, puzzleScore
        });
        
        // Вызываем основную функцию с одним соперником
        const result = calculateGlicko2(
            puzzleRating,
            puzzleRD,
            [userRating],
            [userRD],
            [puzzleScore],
            puzzleVolatility
        );
        
        console.log('New puzzle rating calculated:', result);
        return result;
    }
}); 
