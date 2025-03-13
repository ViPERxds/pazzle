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
            expectedTo: expectedTo
        });
        
        // Проверяем, совпадает ли ход с move2
        // Сначала проверяем точное совпадение
        if (source + target === expectedMove) {
            console.log('Exact match with move2');
            submitSolution(true);
            return 'snapback';
        }
        
        // Если не совпадает точно, проверяем, совпадает ли целевая клетка
        // Это может быть случай, когда несколько фигур могут пойти на одну и ту же клетку
        if (target === expectedTo) {
            // Проверяем, является ли это ходом той же фигурой
            const userPiece = game.get(source);
            const expectedPiece = game.get(expectedFrom);
            
            if (expectedPiece && userPiece && 
                userPiece.type === expectedPiece.type && 
                userPiece.color === expectedPiece.color) {
                console.log('Same piece type moving to the expected target square');
                submitSolution(true);
                return 'snapback';
            }
        }
        
        // Если ход не совпадает с ожидаемым, считаем его неверным
        console.log('Move does not match expected move2');
        submitSolution(false);
        
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

    // Обновляем функцию showPuzzle
    function showPuzzle(puzzle) {
        if (!puzzle) {
            console.error('No puzzle data provided');
            return;
        }

        console.log('Showing puzzle:', puzzle);

        // Проверяем наличие всех необходимых данных
        if (!puzzle.fen1 || !puzzle.move1 || !puzzle.move2) {
            console.error('Missing required puzzle data:', puzzle);
            return;
        }

        // Определяем цвет из строкового значения 'w' или 'b'
        const orientation = puzzle.color === 'w' ? 'white' : 'black';
        
        // Проверяем формат ходов
        const move1Format = /^[a-h][1-8][a-h][1-8]$/.test(puzzle.move1);
        const move2Format = /^[a-h][1-8][a-h][1-8]$/.test(puzzle.move2);
        
        if (!move1Format || !move2Format) {
            console.error('Invalid move format:', {
                move1: puzzle.move1,
                move2: puzzle.move2,
                move1Valid: move1Format,
                move2Valid: move2Format
            });
            return;
        }
        
        // Проверяем и исправляем ходы
        if (!validateAndFixMoves(puzzle)) {
            console.error('Failed to validate moves');
            showError('Ошибка в данных задачи. Пожалуйста, попробуйте другую задачу.');
            return;
        }
        
        // Обновляем конфигурацию
        puzzleConfig = {
            initialFen: puzzle.fen1,
            fen2: puzzle.fen2,
            move1: puzzle.move1,
            move2: puzzle.move2,
            orientation: orientation,
            solution: puzzle.solution === 'Good'
        };

        console.log('Updated puzzle config:', puzzleConfig);

        // Сбрасываем состояние игры и инициализируем доску
        game = new Chess();
        initializeBoard(puzzleConfig);
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
            
            // Получаем координаты хода
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
            const color = puzzleConfig.orientation;
            
            console.log('Opening analysis with FEN:', fen);
            
            // Открываем страницу анализа на lichess
            window.open(`https://lichess.org/analysis/${fen}?color=${color}`, '_blank');
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

        // Получаем ориентацию доски
        const orientation = puzzleConfig.orientation || 'white';
        
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
        
        // Получаем элемент доски
        const boardElement = document.querySelector('#board');
        if (!boardElement) {
            console.error('Board element not found');
            return;
        }
        
        // Получаем размер доски
        const boardSize = boardElement.offsetWidth;
        const squareSize = boardSize / 8;
        
        // Функция для преобразования координат клетки в координаты на доске
        function squareToCoords(square) {
            const file = square.charCodeAt(0) - 'a'.charCodeAt(0); // 0-7 для a-h
            const rank = 8 - parseInt(square[1]); // 0-7 для 8-1
            
            // Учитываем ориентацию доски
            let x, y;
            if (orientation === 'white') {
                x = file * squareSize + squareSize / 2;
                y = rank * squareSize + squareSize / 2;
            } else {
                x = (7 - file) * squareSize + squareSize / 2;
                y = (7 - rank) * squareSize + squareSize / 2;
            }
            
            return { x, y };
        }
        
        // Получаем координаты начальной и конечной клеток
        const fromCoords = squareToCoords(from);
        const toCoords = squareToCoords(to);
        
        console.log('Arrow coordinates:', {
            from: { square: from, coords: fromCoords },
            to: { square: to, coords: toCoords },
            orientation: orientation,
            boardSize: boardSize,
            squareSize: squareSize
        });
        
        // Вычисляем параметры стрелки
        const dx = toCoords.x - fromCoords.x;
        const dy = toCoords.y - fromCoords.y;
        const angle = Math.atan2(dy, dx);
        const length = Math.sqrt(dx * dx + dy * dy);
        
        // Параметры стрелки
        const headLength = squareSize * 0.3;
        const headWidth = squareSize * 0.3;
        const lineWidth = squareSize * 0.15;
        
        // Вычисляем точки для стрелки
        const arrowLength = length - headLength;
        
        // Направляющие векторы
        const ux = Math.cos(angle);
        const uy = Math.sin(angle);
        const vx = -uy; // перпендикулярный вектор
        const vy = ux;
        
        // Точки для стрелки
        const points = [
            // Начало стрелки (левая сторона линии)
            fromCoords.x + vx * lineWidth/2,
            fromCoords.y + vy * lineWidth/2,
            
            // Конец линии (левая сторона)
            fromCoords.x + ux * arrowLength + vx * lineWidth/2,
            fromCoords.y + uy * arrowLength + vy * lineWidth/2,
            
            // Начало наконечника (левая сторона)
            fromCoords.x + ux * arrowLength + vx * headWidth/2,
            fromCoords.y + uy * arrowLength + vy * headWidth/2,
            
            // Кончик стрелки
            toCoords.x,
            toCoords.y,
            
            // Начало наконечника (правая сторона)
            fromCoords.x + ux * arrowLength - vx * headWidth/2,
            fromCoords.y + uy * arrowLength - vy * headWidth/2,
            
            // Конец линии (правая сторона)
            fromCoords.x + ux * arrowLength - vx * lineWidth/2,
            fromCoords.y + uy * arrowLength - vy * lineWidth/2,
            
            // Начало стрелки (правая сторона линии)
            fromCoords.x - vx * lineWidth/2,
            fromCoords.y - vy * lineWidth/2
        ];
        
        // Создаем путь для стрелки
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        let pathData = `M ${points[0]} ${points[1]}`;
        for (let i = 2; i < points.length; i += 2) {
            pathData += ` L ${points[i]} ${points[i+1]}`;
        }
        pathData += ' Z'; // замыкаем путь
        
        path.setAttribute("d", pathData);
        path.setAttribute("fill", color);
        path.setAttribute("opacity", "0.5");
        
        svg.appendChild(path);
        boardElement.appendChild(svg);
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
}); 
