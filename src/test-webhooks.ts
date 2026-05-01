import crypto from 'crypto';
import axios from 'axios';

const SECRET = 'devmetrics_test_secret';
const TEAM_ID = 'a2190ce0-2623-4608-8015-5d25265ab168'; // your team ID

const payload = {
    ref: 'refs/heads/main',
    pusher: {
        email: 'carlo2@test.com', // your registered email
    },
    repository: {
        name: 'devmetrics',
    },
    commits: [
        { message: 'feat: add webhook support' },
        { message: 'fix: auth middleware' },
    ],
};

const body = JSON.stringify(payload);
const signature = `sha256=${crypto
    .createHmac('sha256', SECRET)
    .update(body)
    .digest('hex')}`;

async function testWebhook() {
    try {
        const res = await axios.post(
            `http://localhost:3000/webhooks/github/${TEAM_ID}`,
            payload,
            {
                headers: {
                    'Content-Type': 'application/json',
                    'x-hub-signature-256': signature,
                    'x-github-event': 'push',
                },
            }
        );
        console.log('Webhook response:', res.data);
    } catch (err: any) {
        console.error('Error:', err?.response?.data || err.message);
    }
}

testWebhook();