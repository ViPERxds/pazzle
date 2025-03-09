const API_BASE_URL = 'https://chess-puzzles-bot.onrender.com/api';

async function handleApiResponse(response) {
    if (!response.ok) {
        console.error('API Error:', {
            status: response.status,
            statusText: response.statusText,
            url: response.url
        });
        
        let errorData;
        try {
            errorData = await response.json();
        } catch (e) {
            errorData = {
                error: 'Unknown error',
                message: response.statusText
            };
        }
        throw new Error(errorData.message || errorData.error || `API request failed: ${response.status}`);
    }
    return response.json();
}

export async function getUserRating(username) {
    try {
        console.log(`Fetching rating for user: ${username}`);
        const response = await fetch(`${API_BASE_URL}/user-rating/${username}`, {
            method: 'GET',
            credentials: 'include',
            headers: {
                'Accept': 'application/json',
                'Origin': window.location.origin
            }
        });
        const data = await handleApiResponse(response);
        console.log(`Rating data received:`, data);
        return data;
    } catch (error) {
        console.error('Error getting user rating:', error);
        throw error;
    }
}

export async function getRandomPuzzle(username) {
    try {
        console.log(`Fetching random puzzle for user: ${username}`);
        const response = await fetch(`${API_BASE_URL}/random-puzzle/${username}`, {
            method: 'GET',
            credentials: 'include',
            headers: {
                'Accept': 'application/json',
                'Origin': window.location.origin
            }
        });
        const data = await handleApiResponse(response);
        console.log(`Puzzle data received:`, data);
        return data;
    } catch (error) {
        console.error('Error getting random puzzle:', error);
        throw error;
    }
}

export async function recordSolution(username, puzzleId, success, time) {
    try {
        console.log(`Recording solution:`, { username, puzzleId, success, time });
        const response = await fetch(`${API_BASE_URL}/record-solution`, {
            method: 'POST',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'Origin': window.location.origin
            },
            body: JSON.stringify({
                username,
                puzzleId,
                success,
                time
            })
        });
        const data = await handleApiResponse(response);
        console.log(`Solution recorded:`, data);
        return data;
    } catch (error) {
        console.error('Error recording solution:', error);
        throw error;
    }
} 
