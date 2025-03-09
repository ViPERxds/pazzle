const API_BASE_URL = 'https://chess-puzzles-bot.onrender.com/api';

async function handleApiResponse(response) {
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({
            error: 'Unknown error',
            message: response.statusText
        }));
        throw new Error(errorData.message || errorData.error || 'API request failed');
    }
    return response.json();
}

export async function getUserRating(username) {
    try {
        const response = await fetch(`${API_BASE_URL}/user-rating/${username}`, {
            method: 'GET',
            credentials: 'include',
            headers: {
                'Accept': 'application/json'
            }
        });
        return handleApiResponse(response);
    } catch (error) {
        console.error('Error getting user rating:', error);
        throw error;
    }
}

export async function getRandomPuzzle(username) {
    try {
        const response = await fetch(`${API_BASE_URL}/random-puzzle/${username}`, {
            method: 'GET',
            credentials: 'include',
            headers: {
                'Accept': 'application/json'
            }
        });
        return handleApiResponse(response);
    } catch (error) {
        console.error('Error getting random puzzle:', error);
        throw error;
    }
}

export async function recordSolution(username, puzzleId, success, time) {
    try {
        const response = await fetch(`${API_BASE_URL}/record-solution`, {
            method: 'POST',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({
                username,
                puzzleId,
                success,
                time
            })
        });
        return handleApiResponse(response);
    } catch (error) {
        console.error('Error recording solution:', error);
        throw error;
    }
} 
