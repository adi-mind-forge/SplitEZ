// OCR Bill Scanner using Tesseract.js
// Tesseract.js will be loaded via script tag in expenses.html

let ocrWorker = null;

// Initialize OCR worker
async function initOCR() {
    if (typeof Tesseract === 'undefined') {
        // Load Tesseract.js dynamically
        await loadTesseract();
    }
    if (!ocrWorker) {
        ocrWorker = await Tesseract.createWorker({
            logger: () => {} // silence logs; switch to (m)=>console.log(m) for debugging
        });
        await ocrWorker.loadLanguage('eng');
        await ocrWorker.initialize('eng');
    }
    return ocrWorker;
}

// Load Tesseract.js dynamically
async function loadTesseract() {
    return new Promise((resolve, reject) => {
        if (typeof Tesseract !== 'undefined') {
            resolve();
            return;
        }
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@4/dist/tesseract.min.js';
        script.async = true;
        script.onload = () => {
            if (typeof Tesseract === 'undefined') {
                reject(new Error('Tesseract failed to load'));
            } else {
                resolve();
            }
        };
        script.onerror = (e) => reject(e?.error || new Error('Failed to load Tesseract.js'));
        document.head.appendChild(script);
    });
}

// Scan bill image
export async function scanBill(imageFile) {
    try {
        const worker = await initOCR();
        // Read file as data URL once and reuse for preview + OCR
        const dataUrl = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = e => resolve(e.target.result);
            reader.onerror = reject;
            reader.readAsDataURL(imageFile);
        });
        
        // Show preview
        const preview = document.getElementById('ocrPreview');
        if (preview) {
            preview.innerHTML = `<img src="${dataUrl}" alt="Bill preview">`;
        }
        
        // Perform OCR (use data URL for best cross-browser support)
        const { data: { text } } = await worker.recognize(dataUrl);
        
        // Parse extracted text
        const parsedData = parseBillText(text);
        
        // Display results
        const resultsDiv = document.getElementById('ocrResults');
        const useButton = document.getElementById('useOcrData');
        
        if (resultsDiv) {
            resultsDiv.innerHTML = `
                <h4>Extracted Text:</h4>
                <pre style="white-space: pre-wrap; font-size: 12px;">${text}</pre>
                <h4>Parsed Data:</h4>
                <div>
                    <p><strong>Amount:</strong> ₹${parsedData.amount || 'Not found'}</p>
                    <p><strong>Date:</strong> ${parsedData.date || 'Not found'}</p>
                    <p><strong>Merchant:</strong> ${parsedData.merchant || 'Not found'}</p>
                </div>
            `;
        }
        
        if (useButton) {
            useButton.style.display = 'block';
            useButton.onclick = () => useOCRData(parsedData);
        }
        
        return parsedData;
    } catch (error) {
        console.error('OCR Error:', error);
        const message = (error && (error.message || error.reason || error.type)) 
            || (typeof error === 'string' ? error : JSON.stringify(error));
        alert('Error scanning bill: ' + message);
        return null;
    }
}

// Parse bill text to extract relevant information
function parseBillText(text) {
    const parsed = {
        amount: null,
        date: null,
        merchant: null
    };
    
    // Extract amount (look for currency patterns)
    const amountPatterns = [
        /(?:total|amount|amt|rs\.?|₹)\s*:?\s*(\d+[.,]?\d*)/i,
        /(\d+[.,]?\d*)\s*(?:total|amount)/i,
        /₹\s*(\d+[.,]?\d*)/i
    ];
    
    for (const pattern of amountPatterns) {
        const match = text.match(pattern);
        if (match) {
            parsed.amount = parseFloat(match[1].replace(/,/g, ''));
            break;
        }
    }
    
    // Extract date (look for date patterns)
    const datePatterns = [
        /(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/,
        /(\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+\d{2,4})/i
    ];
    
    for (const pattern of datePatterns) {
        const match = text.match(pattern);
        if (match) {
            parsed.date = match[1];
            break;
        }
    }
    
    // Extract merchant name (usually at the top of the bill)
    const lines = text.split('\n').filter(line => line.trim().length > 0);
    if (lines.length > 0) {
        parsed.merchant = lines[0].trim();
    }
    
    return parsed;
}

// Use OCR data to fill expense form
function useOCRData(parsedData) {
    // Close OCR modal
    const ocrModal = document.getElementById('ocrModal');
    if (ocrModal) {
        ocrModal.classList.remove('show');
    }
    
    // Open add expense modal
    const addExpenseModal = document.getElementById('addExpenseModal');
    if (addExpenseModal) {
        addExpenseModal.classList.add('show');
    }
    
    // Fill form fields
    if (parsedData.amount && document.getElementById('expenseAmount')) {
        document.getElementById('expenseAmount').value = parsedData.amount;
    }
    
    if (parsedData.merchant && document.getElementById('expenseDescription')) {
        document.getElementById('expenseDescription').value = parsedData.merchant;
    }
    
    if (parsedData.date && document.getElementById('expenseDate')) {
        // Try to parse and format date
        try {
            const date = new Date(parsedData.date);
            if (!isNaN(date.getTime())) {
                document.getElementById('expenseDate').value = date.toISOString().split('T')[0];
            }
        } catch (e) {
            // If date parsing fails, use today's date
            const today = new Date().toISOString().split('T')[0];
            document.getElementById('expenseDate').value = today;
        }
    }
}

// Setup OCR functionality
if (document.getElementById('billImage')) {
    document.getElementById('billImage').addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (file) {
            await scanBill(file);
        }
    });
}

if (document.getElementById('scanBillBtn')) {
    document.getElementById('scanBillBtn').addEventListener('click', () => {
        const ocrModal = document.getElementById('ocrModal');
        if (ocrModal) {
            ocrModal.classList.add('show');
        }
    });
}

