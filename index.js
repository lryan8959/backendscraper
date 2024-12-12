const express = require('express');
const puppeteer = require('puppeteer');
const cors = require('cors');
const serviceAccount = require('./ai-tools-6d313-firebase-adminsdk-e0mhj-919b1a7673.json'); // Firebase credentials
const admin = require('firebase-admin');
const axios = require('axios');
const cheerio = require('cheerio');
const { google } = require('googleapis');

const app = express();
const PORT = process.env.PORT || 5000;


// Ensure corsOptions is declared
const corsOptions = {
    origin: '*', // Allow all origins
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  };

  
app.use(cors(corsOptions));


app.use(cors(corsOptions));

// Initialize Firebase Admin SDK
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://ai-tools-6d313-ed2be.firebaseio.com/"
});

// Initialize Google Sheets API
const sheets = google.sheets({ version: 'v4', auth: new google.auth.GoogleAuth({
    keyFile: './ai-tools-6d313-2576d73388c2.json', // Path to your Google Sheets credentials JSON
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
}) });

// Your Google Sheet ID
const SPREADSHEET_ID = '1wXaxl8gEtBCE49lRoP6Uuh4mk8HXuGVIjTz2dv7d5BA';

// Function to fetch the description from the tool info link
async function fetchDescription(toolInfoLink) {
    try {
        const response = await axios.get(toolInfoLink);
        const $ = cheerio.load(response.data);
        const description = $('meta[name="description"]').attr('content') || 'No description available';
        return description;
    } catch (error) {
        console.error('Error fetching description:', error);
        return 'Error fetching description';
    }
}

// Modify the scrapeAITools function to accept a URL
async function scrapeAITools(url) {
    try {
        const browser = await puppeteer.launch({ headless: true });
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
        await page.goto(url, { waitUntil: 'networkidle2' });
        await page.waitForSelector('ul.tasks');

        const tools = await page.evaluate(() => {
            const toolElements = document.querySelectorAll('li.li.m.verified.active, li.li.m.tf_xyz2.verified, li.li.m');
            return Array.from(toolElements).map(element => {
                const toolName = element.querySelector('.ai_link_wrap a.ai_link span')?.innerText;
                const toolIcon = element.querySelector('.li_left img.taaft_icon')?.src;
                const toolInfoLink = element.querySelector('.external_ai_link')?.href;
                const toolLink = element.querySelector('.ai_link_wrap a.ai_link')?.href;

                return {
                    toolName,
                    toolIcon,
                    toolInfoLink,
                    toolLink,
                };
            });
        });

        await browser.close();
        return tools;
    } catch (error) {
        console.error('Error scraping the AI tools:', error);
        throw error;
    }
}

// Function to write data to Google Sheets
async function writeToGoogleSheets(tools) {
    const rows = tools.map(tool => [
        tool.toolName,
        tool.toolIcon,
        tool.toolInfoLink,
        tool.toolLink,
        tool.description
    ]);

    const resource = {
        values: rows,
    };

    try {
        await sheets.spreadsheets.values.append({
            spreadsheetId: SPREADSHEET_ID,
            range: 'Sheet1!A:E', // Adjust the range as needed
            valueInputOption: 'RAW',
            resource,
        });
        console.log('Data written to Google Sheets successfully.');
    } catch (error) {
        console.error('Error writing to Google Sheets:', error);
    }
}

// Create an endpoint for scraping AI tools
app.get('/api/scrape-tools', async (req, res) => {
    const { url } = req.query;
    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }

    try {
        const tools = await scrapeAITools(url);
        const db = admin.database();
        const ref = db.ref('ai_tools');

        for (const tool of tools) {
            const toolRef = ref.orderByChild('toolName').equalTo(tool.toolName);
            const snapshot = await toolRef.once('value');

            if (!snapshot.exists()) {
                // Fetch the description and assign it to the tool object
                tool.description = await fetchDescription(tool.toolInfoLink);
                await ref.push(tool);
            } else {
                // If the tool already exists, you might want to fetch the description anyway
                // and update the tool object (optional)
                tool.description = await fetchDescription(tool.toolInfoLink);
            }
        }

        // Now write the updated tools array to Google Sheets
        await writeToGoogleSheets(tools);
        res.status(200).json({ message: 'Scraping and data storage successful', tools });
    } catch (error) {
        console.error('Error in scraping tools:', error);
        res.status(500).json({ error: 'An error occurred while scraping tools' });
    }
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});