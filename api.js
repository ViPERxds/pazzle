const API_BASE_URL = 'https://chess-puzzles-bot.onrender.com/api';

async function handleApiResponse(response) {
    if (!response.ok) {
        const contentType = response.headers.get('content-type');
        let errorMessage;
        try {
            if (contentType && contentType.includes('application/json')) {
                const errorData = await response.json();
                errorMessage = errorData.error || errorData.message || `HTTP error! status: ${response.status}`;
            } else {
                errorMessage = await response.text() || `HTTP error! status: ${response.status}`;
            }
        } catch (e) {
            errorMessage = `HTTP error! status: ${response.status}`;
        }
        console.error('API Error:', {
            status: response.status,
            statusText: response.statusText,
            url: response.url,
            error: errorMessage
        });
        throw new Error(errorMessage);
    }

    const contentType = response.headers.get('content-type');
    try {
        if (contentType && contentType.includes('application/json')) {
            return await response.json();
        }
        return await response.text();
    } catch (error) {
        console.error('Error parsing response:', error);
        throw new Error('Failed to parse server response');
    }
}

export async function getUserRating(username) {
    try {
        console.log(`Fetching rating for user: ${username}`);
        const response = await fetch(`${API_BASE_URL}/user-rating/${username}`, {
            method: 'GET',
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
        console.log(`Fetching random puzzle for user: ${username}`);
        const response = await fetch(`${API_BASE_URL}/random-puzzle/${username}`, {
            method: 'GET',
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
        console.log(`Recording solution:`, { username, puzzleId, success, time });
        const response = await fetch(`${API_BASE_URL}/record-solution`, {
            method: 'POST',
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
