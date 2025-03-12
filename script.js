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
                    console.log('Drawing arrow from', move2From, 'to', move2To);
                    drawArrow(move2From, move2To, 'black');
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
        
        // Проверяем, совпадает ли ход с move2
        const moveStr = source + target;
        if (moveStr === puzzleConfig.move2) {
            submitSolution(true);
        } else {
            submitSolution(false);
        }
        
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
            console.log('Puzzle details:', {
                id: puzzle.id,
                fen1: puzzle.fen1,
                move1: puzzle.move1,
                fen2: puzzle.fen2,
                move2: puzzle.move2,
                color: puzzle.color
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

            // Подробное логирование текущей позиции
            const board = tempGame.board();
            const pieces = [];
            for (let i = 0; i < 8; i++) {
                for (let j = 0; j < 8; j++) {
                    const piece = board[i][j];
                    if (piece) {
                        const square = String.fromCharCode(97 + j) + (8 - i);
                        pieces.push({
                            square: square,
                            piece: piece.type,
                            color: piece.color
                        });
                    }
                }
            }
            
            console.log('Current board state:', {
                fen: tempGame.fen(),
                turn: tempGame.turn(),
                pieces: pieces
            });
            
            // Проверяем ход move1
            const [fromSquare, toSquare] = [
                puzzle.move1.substring(0, 2),
                puzzle.move1.substring(2, 4)
            ];
            
            // Получаем все возможные ходы
            const allLegalMoves = tempGame.moves({ verbose: true });
            console.log('All legal moves:', allLegalMoves);
            
            // Проверяем, есть ли фигура на начальной позиции
            const pieceOnStart = tempGame.get(fromSquare);
            
            // Если есть фигура на начальной позиции, ищем любой её возможный ход
            if (pieceOnStart) {
                const movesFromStart = allLegalMoves.filter(m => m.from === fromSquare);
                if (movesFromStart.length > 0) {
                    // Берем первый возможный ход этой фигуры
                    console.log('Found alternative move for piece:', movesFromStart[0]);
                    puzzle.move1 = movesFromStart[0].from + movesFromStart[0].to;
                } else {
                    console.error('No legal moves for piece at:', fromSquare);
                    throw new Error('Неверные данные хода: нет возможных ходов для фигуры');
                }
            } else {
                // Если нет фигуры на начальной позиции, ищем любой возможный ход
                if (allLegalMoves.length > 0) {
                    // Берем первый возможный ход
                    console.log('Using first available move:', allLegalMoves[0]);
                    puzzle.move1 = allLegalMoves[0].from + allLegalMoves[0].to;
                } else {
                    console.error('No legal moves in position');
                    console.error('Available pieces:', pieces.map(p => `${p.color}${p.piece} on ${p.square}`).join(', '));
                    throw new Error('Неверные данные хода: нет возможных ходов');
                }
            }
            
            // Проверяем, что фигура принадлежит тому, чей ход
            const selectedMove = allLegalMoves.find(m => 
                m.from === puzzle.move1.substring(0, 2) && 
                m.to === puzzle.move1.substring(2, 4)
            );
            
            if (!selectedMove) {
                console.error('Selected move is not legal:', puzzle.move1);
                throw new Error('Неверные данные хода: ход невозможен');
            }
            
            const pieceOnSquare = tempGame.get(selectedMove.from);
            if ((tempGame.turn() === 'w' && pieceOnSquare.color === 'b') ||
                (tempGame.turn() === 'b' && pieceOnSquare.color === 'w')) {
                console.error('Wrong color to move:', {
                    turn: tempGame.turn(),
                    pieceColor: pieceOnSquare.color
                });
                throw new Error('Неверные данные хода: ход не той стороны');
            }
            
            // Проверяем формат ходов
            if (!puzzle.move1 || !/^[a-h][1-8][a-h][1-8]$/.test(puzzle.move1)) {
                console.error('Invalid move1 format:', puzzle.move1);
                throw new Error('Неверный формат хода move1');
            }
            
            if (!puzzle.move2 || !/^[a-h][1-8][a-h][1-8]$/.test(puzzle.move2)) {
                console.error('Invalid move2 format:', puzzle.move2);
                throw new Error('Неверный формат хода move2');
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

        // Получаем координаты квадратов
        const squares = board.querySelectorAll('.square-55d63');
        let fromSquare = null;
        let toSquare = null;

        squares.forEach(square => {
            const squareData = square.getAttribute('data-square');
            if (squareData === from) fromSquare = square;
            if (squareData === to) toSquare = square;
        });
        
        if (!fromSquare || !toSquare) {
            console.error('Squares not found:', from, to);
            return;
        }

        const boardRect = board.getBoundingClientRect();
        const fromRect = fromSquare.getBoundingClientRect();
        const toRect = toSquare.getBoundingClientRect();
        
        // Вычисляем координаты центров квадратов
        const squareSize = boardRect.width / 8;

        // Получаем координаты клеток
        const fromCoords = getSquareCoords(from);
        const toCoords = getSquareCoords(to);

        // Вычисляем центры клеток
        const x1 = fromCoords.x * squareSize + squareSize / 2;
        const y1 = fromCoords.y * squareSize + squareSize / 2;
        const x2 = toCoords.x * squareSize + squareSize / 2;
        const y2 = toCoords.y * squareSize + squareSize / 2;

        // Параметры стрелки
        const headSize = squareSize * 0.4;
        const arrowWidth = squareSize * 0.15;

        // Вычисляем угол и длину
        const angle = Math.atan2(y2 - y1, x2 - x1);
        const length = Math.sqrt((x2-x1)**2 + (y2-y1)**2);

        // Создаем путь для стрелки
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        const arrowPath = `
            M ${x1} ${y1}
            L ${x2 - headSize * Math.cos(angle)} ${y2 - headSize * Math.sin(angle)}
            L ${x2 - headSize * Math.cos(angle) - headSize/2 * Math.sin(angle)} ${y2 - headSize * Math.sin(angle) + headSize/2 * Math.cos(angle)}
            L ${x2} ${y2}
            L ${x2 - headSize * Math.cos(angle) + headSize/2 * Math.sin(angle)} ${y2 - headSize * Math.sin(angle) - headSize/2 * Math.cos(angle)}
            L ${x2 - headSize * Math.cos(angle)} ${y2 - headSize * Math.sin(angle)}
            Z
        `;

        path.setAttribute("d", arrowPath);
        path.setAttribute("fill", color || "#00ff00");
        path.setAttribute("opacity", "0.5");
        path.setAttribute("stroke", color || "#00ff00");
        path.setAttribute("stroke-width", "2");

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
}); 
