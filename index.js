const puppeteer = require('puppeteer');
const fetch = require('node-fetch');

const locationMap = {
    'toronto': 94,
    'calgary': 89,
    'halifax': 90,
    'montreal': 91,
    'ottawa': 92,
    'quebec': 93,
    'vancouver': 95
};

/**
 * Responds to any HTTP request.
 *
 * @param {!express:Request} req HTTP request context.
 * @param {!express:Response} res HTTP response context.
 */
exports.startScraping = (req, res) => {
    scrape().then(() => {
        res.status(200).send("Scraping Completed");
    }).catch((err) => {
        sendNotification(`Error occured in execution ${err}`);
        res.status(500).send(`Failed to execute function ${err}`);
    });
};

const sendNotification = async (message) => {
    const url = process.env.webhook_url;
    const data = JSON.stringify({
        'text': message,
    });
    const resp = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json; charset=UTF-8',
        },
        body: data,
    });
    return resp;
}

const notifyChat = async (dates) => {
    if (!dates || !dates[0] || !dates[0]['date']) {
        return sendNotification(`No dates available for appointment`);
    }
    const date = dates[0]['date'];
    const today = new Date();
    const appDate = new Date(date);
    const diffTime = Math.abs(appDate - today);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    console.log(diffDays + " days");
    // if (diffDays > 100) {
    //     return;
    // }
    return sendNotification(`Earliest appointment date is ${date}`);

}

const getLatestDate = (dates) => {
    if (!dates || !dates[0] || !dates[0]['date']) {
        return 'N/A';
    }
    return dates[0]['date'];
}

const time = async (milliseconds) => {
    return new Promise((resolve, reject) => {
        setTimeout(() => {
            return resolve(true);
        }, milliseconds);
    })
}

const scrape = async () => {
    const options = {
        args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--single-process', // <- this one doesn't work in Windows
        '--disable-gpu'
        ],
        headless: true
    }
    const browser = await puppeteer.launch(options);
    const page = await browser.newPage();

    await page.goto('https://ais.usvisa-info.com/en-ca/niv/users/sign_in');
    await page.type('#user_email', process.env.email);
    await page.type('#user_password', process.env.password);
    const checkboxEl = await page.waitForSelector('#policy_confirmed');
    checkboxEl.click();
    await time(200);
    const button = await page.$x('//*[@id="sign_in_form"]/p[1]/input');
    await button[0].click()
    await time(500);
    let dateMatrix = {};

    for (let location in locationMap) {
        console.log(location);
        await page.goto(`https://ais.usvisa-info.com/en-ca/niv/schedule/${process.env.appointment_id}/appointment/days/${locationMap[location]}.json?appointments[expedite]=false`);
        await time(500);
        await page.content();
        await time(500);
        dateMatrix[location] = await page.evaluate(() => {
            return JSON.parse(document.querySelector("body").innerText);
        });

        console.log(dateMatrix);
    }
    await browser.close();

    let notification = "The Earliest Available dates are: \n";
    notification += Object.keys(dateMatrix).map((location) => {
        return location + ": "+ getLatestDate(dateMatrix[location]);
    }).join('\n');

    await sendNotification(notification);
};