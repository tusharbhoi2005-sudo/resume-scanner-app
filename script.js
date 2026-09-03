document.addEventListener('DOMContentLoaded', () => {
    // We intentionally do not set workerSrc here. 
    // When running via local file://, cross-origin workers are blocked. 
    // Omitting this allows pdf.js to fall back to the main thread securely.

    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('resumes');
    const fileList = document.getElementById('file-list');
    const form = document.getElementById('screener-form');
    const submitBtn = document.getElementById('submit-btn');
    const btnText = submitBtn.querySelector('.btn-text');
    const resultsContainer = document.getElementById('results-container');
    
    let uploadedFiles = [];

    // Stop words
    const stopWords = new Set(["a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "has", "he", "in", "is", "it", "its", "of", "on", "that", "the", "to", "was", "were", "will", "with", "this", "which", "or", "an", "your"]);

    // Handle Drag & Drop
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, preventDefaults, false);
    });

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => {
            dropZone.classList.add('dragover');
        }, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => {
            dropZone.classList.remove('dragover');
        }, false);
    });

    dropZone.addEventListener('drop', (e) => {
        let dt = e.dataTransfer;
        let files = dt.files;
        handleFiles(files);
        fileInput.files = files;
    });

    fileInput.addEventListener('change', function() {
        handleFiles(this.files);
    });

    function handleFiles(files) {
        fileList.innerHTML = '';
        uploadedFiles = Array.from(files).filter(f => (f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')) || (f.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || f.name.toLowerCase().endsWith('.docx')));
        
        if (uploadedFiles.length > 0) {
            uploadedFiles.forEach(file => {
                const fileItem = document.createElement('div');
                fileItem.className = 'file-item';
                fileItem.textContent = file.name;
                fileList.appendChild(fileItem);
            });
        } else {
            fileList.innerHTML = '<div class="error-message">Please select only PDF or Word files.</div>';
        }
    }

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const jobDesc = document.getElementById('job-description').value;
        
        if(!jobDesc.trim()) {
            showError('Please enter a job description.');
            return;
        }
        
        if(uploadedFiles.length === 0) {
            showError('Please upload at least one resume (PDF or Word).');
            return;
        }

        setLoading(true);

        try {
            resultsContainer.innerHTML = '<div class="empty-state"><p>Extracting text from files...</p></div>';
            const resumesData = await Promise.all(uploadedFiles.map(async (file) => {
                const text = await extractTextFromFile(file);
                return { filename: file.name, text: text };
            }));

            resultsContainer.innerHTML = '<div class="empty-state"><p>Analyzing and ranking matches...</p></div>';
            
            // Check if parsing worked
            const validResumes = resumesData.filter(r => r.text && r.text.length > 0);
            if (validResumes.length === 0) {
                throw new Error("Could not extract any readable text from the provided files.");
            }

            const results = rankResumesCustom(jobDesc, validResumes);
            renderResults(results);
            
        } catch (error) {
            console.error(error);
            showError(error.message);
        } finally {
            setLoading(false);
        }
    });

    // --- File text extraction ---
    async function extractTextFromFile(file) {
        const fileName = file.name.toLowerCase();
        const arrayBuffer = await file.arrayBuffer();
        
        if (fileName.endsWith('.pdf') || file.type === 'application/pdf') {
            return await extractTextFromPDF(arrayBuffer, file.name);
        } else if (fileName.endsWith('.docx') || file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
            return await extractTextFromDocx(arrayBuffer, file.name);
        } else {
            throw new Error(`Unsupported file type: ${file.name}`);
        }
    }

    async function extractTextFromPDF(arrayBuffer, fileName) {
        try {
            const typedarray = new Uint8Array(arrayBuffer);
            const pdf = await pdfjsLib.getDocument(typedarray).promise;
            let fullText = "";
            for (let i = 1; i <= pdf.numPages; i++) {
                const page = await pdf.getPage(i);
                const textContent = await page.getTextContent();
                const pageText = textContent.items.map(item => item.str).join(' ');
                fullText += pageText + " ";
            }
            return fullText.trim();
        } catch(e) {
            console.error(`Failed to parse PDF ${fileName}:`, e);
            throw new Error(`Failed to parse PDF ${fileName}: ${e.message}`);
        }
    }

    async function extractTextFromDocx(arrayBuffer, fileName) {
        try {
            const result = await mammoth.extractRawText({ arrayBuffer: arrayBuffer });
            return result.value.trim();
        } catch(e) {
            console.error(`Failed to parse Word document ${fileName}:`, e);
            throw new Error(`Failed to parse Word document ${fileName}: ${e.message}`);
        }
    }

    // --- TF-IDF and Cosine Similarity Logic ---
    function tokenize(text) {
        return text.toLowerCase()
            .replace(/[^a-z0-9\s]/g, ' ')
            .split(/\s+/)
            .filter(w => w.length > 2 && !stopWords.has(w));
    }

    function calculateTF(tokens) {
        const tf = {};
        for (const token of tokens) {
            tf[token] = (tf[token] || 0) + 1;
        }
        // No normalization here to match scikit-learn roughly, or sub-linear TF
        return tf;
    }

    function rankResumesCustom(jobDesc, resumes) {
        const docs = [jobDesc, ...resumes.map(r => r.text)];
        const docsTokens = docs.map(tokenize);
        
        // Build document frequencies (DF)
        const df = {};
        for (const tokens of docsTokens) {
            const uniqueTokens = new Set(tokens);
            for (const token of uniqueTokens) {
                df[token] = (df[token] || 0) + 1;
            }
        }
        
        const N = docs.length;
        const idf = {};
        for (const token in df) {
            // standard idf formulation with smoothing
            idf[token] = Math.log((1 + N) / (1 + df[token])) + 1;
        }

        // Vectorize
        const vocab = Object.keys(idf);
        const vectors = docsTokens.map(tokens => {
            const tf = calculateTF(tokens);
            const vector = new Array(vocab.length).fill(0);
            let normSq = 0;
            
            for (let i = 0; i < vocab.length; i++) {
                const term = vocab[i];
                if (tf[term]) {
                    const weight = tf[term] * idf[term];
                    vector[i] = weight;
                    normSq += weight * weight;
                }
            }
            
            // L2 normalize
            const norm = Math.sqrt(normSq);
            if (norm > 0) {
                for(let i = 0; i < vector.length; i++) {
                    vector[i] = vector[i] / norm;
                }
            }
            return vector;
        });

        const jobVec = vectors[0];
        const results = [];
        
        for(let i = 1; i < vectors.length; i++) {
            let similarity = 0;
            const resVec = vectors[i];
            
            for(let j = 0; j < vocab.length; j++) {
                similarity += jobVec[j] * resVec[j];
            }
            
            // similarity is already a cosine similarity if vectors are normalized
            results.push({
                filename: resumes[i-1].filename,
                score: Math.round(similarity * 100)
            });
        }
        
        // Sort descending
        return results.sort((a, b) => b.score - a.score);
    }

    function setLoading(isLoading) {
        submitBtn.disabled = isLoading;
        btnText.textContent = isLoading ? 'Processing...' : 'Screen Candidates';
    }

    function renderResults(results) {
        resultsContainer.innerHTML = '';
        
        if(!results || results.length === 0) {
            resultsContainer.innerHTML = `
                <div class="empty-state">
                    <p>No results could be processed.</p>
                </div>
            `;
            return;
        }
        
        results.forEach((result, index) => {
            const score = result.score;
            const rank = index + 1;
            let matchClass = 'match-low';
            let bgClass = 'bg-low';
            
            if (score >= 25) { // Adjusted thresholds since raw cosine without ML sometimes scores lower
                matchClass = 'match-high';
                bgClass = 'bg-high';
            } else if (score >= 10) {
                matchClass = 'match-medium';
                bgClass = 'bg-medium';
            }
            
            const card = document.createElement('div');
            card.className = 'result-card';
            
            card.innerHTML = `
                <div class="card-header">
                    <div class="candidate-info">
                        <span class="rank-badge">#${rank}</span>
                        <span class="candidate-name" title="${result.filename}">${result.filename}</span>
                    </div>
                    <div class="match-badge ${matchClass}">${score}%</div>
                </div>
                <div class="score-bar-bg">
                    <div class="score-bar-fill ${bgClass}" style="width: ${score}%"></div>
                </div>
            `;
            
            resultsContainer.appendChild(card);
        });
    }

    function showError(message) {
        resultsContainer.innerHTML = `
            <div class="error-message">
                <strong>Error:</strong> ${message}
            </div>
        `;
    }
});
