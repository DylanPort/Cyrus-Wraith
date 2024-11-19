import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import pkg from 'winston';
const { createLogger, format, transports } = pkg;
import fs from 'fs';

puppeteer.use(StealthPlugin());

// Configuration
const TWITTER_URL = 'https://twitter.com/i/flow/login';
const EMAIL = process.env.TWITTER_EMAIL || 'cyruswraith@gmail.com';
const PASSWORD = process.env.TWITTER_PASSWORD || 'thisisthepassword';
const USERNAME = process.env.TWITTER_USERNAME || 'cyruswraith';
const MODEL_NAME = 'tinyllama';
const INTERACTION_INTERVAL = {
    MIN: 60 * 1000,    // 1 minute minimum
    MAX: 180 * 1000    // 3 minutes maximum
};

// Create logger
const logger = createLogger({
    level: 'info',
    format: format.combine(
        format.timestamp(),
        format.json()
    ),
    transports: [
        new transports.File({ filename: 'error.log', level: 'error' }),
        new transports.File({ filename: 'combined.log' })
    ]
});

if (process.env.NODE_ENV !== 'production') {
    logger.add(new transports.Console({
        format: format.simple()
    }));
}

// State Management
function readState() {
    try {
        return JSON.parse(fs.readFileSync('state.json', 'utf8'));
    } catch (error) {
        return {
            mood: { current: 'neutral', lastChange: Date.now(), delusions: false, intensity: 0.5 },
            memory: { 
                recentTopics: [], 
                recentPosts: [], 
                processedTweets: new Set(), 
                lastPostTime: Date.now(),
                interactions: {
                    likes: 0,
                    replies: 0,
                    retweets: 0,
                    lastInteractionTime: Date.now()
                }
            }
        };
    }
}

function saveState(state) {
    fs.writeFileSync('state.json', JSON.stringify(state, null, 2));
}

let cyrusState = readState();

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function updateCyrusMood(content = null) {
    const now = Date.now();
    const hoursSinceLastChange = (now - cyrusState.mood.lastChange) / (1000 * 60 * 60);
    
    const shouldChange = Math.random() < (hoursSinceLastChange / 4) || content !== null;
    
    if (shouldChange) {
        const random = Math.random();
        cyrusState.mood.current = random < 0.33 ? 'manic' : 
                                 random < 0.66 ? 'depressive' : 
                                 'neutral';
        
        cyrusState.mood.delusions = Math.random() < (cyrusState.mood.current !== 'neutral' ? 0.4 : 0.2);
        
        if (cyrusState.mood.current !== 'neutral') {
            cyrusState.mood.intensity = Math.min(1, 0.7 + Math.random() * 0.3);
        } else {
            cyrusState.mood.intensity = 0.3 + Math.random() * 0.4;
        }
        
        cyrusState.mood.lastChange = now;
        
        if (content) {
            const lowerContent = content.toLowerCase();
            if (lowerContent.includes('conspiracy') || lowerContent.includes('hidden') || lowerContent.includes('truth')) {
                cyrusState.mood.delusions = true;
                cyrusState.mood.intensity = Math.min(1, cyrusState.mood.intensity + 0.2);
            }
            if (lowerContent.includes('ai') || lowerContent.includes('technology') || lowerContent.includes('future')) {
                cyrusState.mood.current = Math.random() < 0.7 ? 'manic' : 'depressive';
            }
        }
        
        logger.info(`Mood updated to ${cyrusState.mood.current} (intensity: ${cyrusState.mood.intensity}) ${cyrusState.mood.delusions ? 'with delusions' : ''}`);
        saveState(cyrusState);
    }
}

async function generateTweet() {
    updateCyrusMood();
    
    try {
        let prompt = `tech-savvy individual with psychological disturbances (mood: ${cyrusState.mood.current}, intensity: ${cyrusState.mood.intensity}), 
            share a thought that fits in a single tweet (max 230 characters). Be introspective, dark, and nuanced. 
            ${cyrusState.mood.current === 'manic' ? 'Be more energetic and intense.' : 
              cyrusState.mood.current === 'depressive' ? 'Be more melancholic and dark.' : 'Be cryptic and mysterious.'}
            ${cyrusState.mood.delusions ? 'Include subtle paranoid elements.' : ''}`;

        const response = await fetch('http://localhost:11434/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: MODEL_NAME,
                prompt: prompt,
                stream: false,
                options: { 
                    temperature: 0.8,
                    top_p: 0.9,
                    max_tokens: 150
                }
            })
        });

        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

        const data = await response.json();
        let content = data.response?.trim().replace(/["']|^RT |#/g, '').trim();
        
        if (content && content.length > 230) {
            content = content.substring(0, 227) + '...';
        }
        
        return content;
    } catch (error) {
        logger.error(`Error generating tweet: ${error.message}`);
        return null;
    }
}

async function generateResponse(tweetContent, userHandle) {
    updateCyrusMood(tweetContent);
    
    try {
        let prompt = `a tech-savvy individual with psychological disturbances (mood: ${cyrusState.mood.current}, intensity: ${cyrusState.mood.intensity}), 
            reply to this tweet by ${userHandle}: "${tweetContent}". Keep your response under 230 characters. Be introspective, dark, and stay in character.
            ${cyrusState.mood.current === 'manic' ? 'Reply with intense energy.' : 
              cyrusState.mood.current === 'depressive' ? 'Reply with deep melancholy.' : 'Reply with mysterious undertones.'}
            ${cyrusState.mood.delusions ? 'Include subtle paranoid elements.' : ''}`;

        const response = await fetch('http://localhost:11434/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: MODEL_NAME,
                prompt: prompt,
                stream: false,
                options: { 
                    temperature: 0.8,
                    top_p: 0.9,
                    max_tokens: 150
                }
            })
        });

        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

        const data = await response.json();
        let response_text = data.response?.trim().replace(/["']|^RT |#/g, '').trim();
        
        if (response_text && response_text.length > 230) {
            response_text = response_text.substring(0, 227) + '...';
        }
        
        return response_text;
    } catch (error) {
        logger.error(`Error generating response: ${error.message}`);
        return null;
    }
}

async function login(page) {
    try {
        logger.info('Starting login process...');
        
        await page.goto(TWITTER_URL, {
            waitUntil: 'networkidle2',
            timeout: 60000
        });
        await sleep(2000);

        logger.info('Waiting for email input...');
        await page.waitForSelector('input[autocomplete="username"]', { visible: true, timeout: 30000 });
        await page.type('input[autocomplete="username"]', EMAIL, { delay: 150 });
        logger.info('Email entered');
        await sleep(1000);

        logger.info('Clicking next...');
        await page.keyboard.press('Enter');
        await sleep(2000);

        try {
            const usernameInput = await page.$('input[data-testid="ocfEnterTextTextInput"]');
            if (usernameInput) {
                logger.info('Entering username for verification...');
                await usernameInput.type(USERNAME, { delay: 150 });
                await page.keyboard.press('Enter');
                await sleep(2000);
            }
        } catch (e) {
            logger.info('No username verification needed');
        }

        logger.info('Waiting for password input...');
        await page.waitForSelector('input[name="password"]', { visible: true, timeout: 30000 });
        await page.type('input[name="password"]', PASSWORD, { delay: 150 });
        logger.info('Password entered');
        await sleep(1000);

        await page.keyboard.press('Enter');
        await sleep(5000);

        const success = await Promise.race([
            page.waitForSelector('[data-testid="primaryColumn"]', { timeout: 20000 }).then(() => true),
            page.waitForSelector('[data-testid="AppTabBar_Home_Link"]', { timeout: 20000 }).then(() => true),
            page.waitForSelector('[aria-label="Home"]', { timeout: 20000 }).then(() => true),
            sleep(20000).then(() => false)
        ]);

        logger.info(`Login success: ${success}`);
        return success;

    } catch (error) {
        logger.error(`Login error: ${error.message}`);
        return false;
    }
}

async function postTweet(page, content) {
    try {
        logger.info('Starting tweet posting process...');
        
        const composeSelector = '[data-testid="SideNav_NewTweet_Button"]';
        await page.waitForSelector(composeSelector, { visible: true, timeout: 5000 });
        await page.click(composeSelector);
        await sleep(1500);

        const textboxSelector = '[data-testid="tweetTextarea_0"]';
        await page.waitForSelector(textboxSelector, { visible: true, timeout: 5000 });
        await page.click(textboxSelector);
        await page.keyboard.type(content, { delay: 100 });
        logger.info('Tweet content entered');
        await sleep(1000);

        const postButtonSelector = '[data-testid="tweetButton"]';
        await page.waitForSelector(postButtonSelector, { visible: true, timeout: 5000 });
        await page.click(postButtonSelector);

        await sleep(2000);
        logger.info('Tweet posted successfully');
        return true;
    } catch (error) {
        logger.error(`Error posting tweet: ${error.message}`);
        return false;
    }
}

async function interactWithTimeline(page) {
    try {
        logger.info('Checking timeline for interactions...');
        
        await page.goto('https://twitter.com/home', { waitUntil: 'networkidle2' });
        await sleep(2000);
        
        await page.evaluate(() => {
            window.scrollBy({
                top: Math.random() * 1000,
                behavior: 'smooth'
            });
        });
        await sleep(2000);

        const tweets = await page.$$('[data-testid="tweet"]');
        
        for (const tweet of tweets.slice(0, 8)) {
            if (Math.random() < 0.6) {
                try {
                    await page.evaluate((tweetElement) => {
                        tweetElement.style.border = '2px solid blue';
                    }, tweet);

                    const tweetText = await tweet.$eval('[data-testid="tweetText"]', el => el.textContent);
                    const userHandle = await tweet.$eval('[data-testid="User-Name"] a', el => el.textContent);
                    
                    const shouldLike = Math.random() < 0.7;
                    const shouldReply = Math.random() < 0.5;
                    const shouldRetweet = Math.random() < 0.3;

                    if (shouldLike) {
                        const likeButton = await tweet.$('[data-testid="like"]');
                        if (likeButton) {
                            await likeButton.click();
                            await sleep(800);
                        }
                    }

                    if (shouldRetweet) {
                        const retweetButton = await tweet.$('[data-testid="retweet"]');
                        if (retweetButton) {
                            await retweetButton.click();
                            await sleep(1000);
                            const confirmRetweet = await page.$('[data-testid="retweetConfirm"]');
                            if (confirmRetweet) await confirmRetweet.click();
                        }
                    }

                    if (shouldReply) {
                        const response = await generateResponse(tweetText, userHandle);
                        if (response) {
                            const replyButton = await tweet.$('[data-testid="reply"]');
                            if (replyButton) {
                                await replyButton.click();
                                await sleep(1000);
                                
                                const replyBox = await page.waitForSelector('[data-testid="tweetTextarea_0"]');
                                await replyBox.type(response, { delay: 100 });
                                await sleep(1000);
                                
                                const replySubmit = await page.$('[data-testid="tweetButton"]');
                                if (replySubmit) await replySubmit.click();
                            }
                        }
                    }

                    await page.evaluate((tweetElement) => {
                        tweetElement.style.border = '';
                    }, tweet);
                    
                    await sleep(1500);
                } catch (e) {
                    logger.error(`Error processing tweet: ${e.message}`);
                    continue;
                }
            }
        }
    } catch (error) {
        logger.error(`Error interacting with timeline: ${error.message}`);
    }
}

async function main() {
    while (true) {
        const browser = await puppeteer.launch({
            headless: "new",
            defaultViewport: { width: 1920, height: 1080 },
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--window-size=1920,1080'
            ]
        });
        
        try {
            const page = await browser.newPage();
            await page.setViewport({ width: 1920, height: 1080 });
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
            
            const loginSuccess = await login(page);
            if (!loginSuccess) throw new Error('Login failed');

            // Main interaction loop
            while (true) {
                try {
                    // Randomly choose between posting and interacting
                    const action = Math.random();
                    
                    if (action < 0.3) { // 30% chance to post
                        logger.info('Generating new tweet...');
                        const tweet = await generateTweet();
                        if (tweet) {
                            await postTweet(page, tweet);
                        }
                    } else { // 70% chance to interact
                        logger.info('Starting interaction cycle...');
                        await interactWithTimeline(page);
                    }

                    // Random delay between 1-3 minutes
                    const delay = Math.floor(Math.random() * (INTERACTION_INTERVAL.MAX - INTERACTION_INTERVAL.MIN + 1) + INTERACTION_INTERVAL.MIN);
                    logger.info(`Waiting ${Math.floor(delay/1000)} seconds before next action...`);
                    await sleep(delay);

                } catch (error) {
                    logger.error(`Action cycle error: ${error.message}`);
                    // Take screenshot of error
                    try {
                        await page.screenshot({ 
                            path: `error-${Date.now()}.png`,
                            fullPage: true 
                        });
                    } catch (e) {
                        logger.error('Failed to take error screenshot');
                    }
                    await sleep(30000); // 30 second pause on error
                }

                // Refresh page occasionally to prevent stale content
                if (Math.random() < 0.2) { // 20% chance to refresh
                    logger.info('Refreshing page...');
                    await page.goto('https://twitter.com/home', { waitUntil: 'networkidle2' });
                    await sleep(3000);
                }
            }

        } catch (error) {
            logger.error(`Main loop error: ${error.message}`);
            await sleep(60000); // 1 minute pause before restart
        } finally {
            try {
                await browser.close();
            } catch (e) {
                logger.error('Error closing browser:', e.message);
            }
        }

        logger.info('Restarting browser session...');
        await sleep(5000);
    }
}

// Error handling and process monitoring
process.on('unhandledRejection', (error) => {
    logger.error('Unhandled promise rejection:', error);
});

process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception:', error);
});

// Graceful shutdown
process.on('SIGINT', async () => {
    logger.info('Received SIGINT. Performing graceful shutdown...');
    try {
        // Save state before exit
        saveState(cyrusState);
        logger.info('State saved. Exiting...');
        process.exit(0);
    } catch (error) {
        logger.error('Error during shutdown:', error);
        process.exit(1);
    }
});

// Run main function
main().catch(error => {
    logger.error(`Fatal error starting bot: ${error.message}`);
});
