# AI Resume Screener

## Overview
AI Resume Screener is a smart, client-side offline web application designed to help recruiters and hiring managers quickly find the perfect candidate. By leveraging TF-IDF and Cosine Similarity algorithms entirely within the browser, it securely ranks uploaded resumes against a provided job description without ever sending sensitive user data to an external server [cite: 1, 2].

## Features
* **Privacy-First Client-Side Processing**: All resume parsing and text analysis happen directly in your browser. No resumes are uploaded to a server [cite: 1].
* **Multi-Format Support**: Seamlessly extracts text from both PDF (`.pdf`) and Word (`.docx`) files [cite: 1, 2].
* **Smart Ranking Engine**: Utilizes Term Frequency-Inverse Document Frequency (TF-IDF) and Cosine Similarity to calculate a match percentage for each candidate against the target job description [cite: 2].
* **Intuitive UI**: Features a modern, responsive design with drag-and-drop file uploading and clear visual match indicators (High, Medium, Low) [cite: 1, 3].

## Technologies Used
* **HTML5 / CSS3 / Vanilla JavaScript**: Core web technologies for the structure, styling, and application logic [cite: 1, 2, 3].
* **[PDF.js](https://mozilla.github.io/pdf.js/)**: Used for extracting text from PDF documents natively in the browser [cite: 1, 2].
* **[Mammoth.js](https://github.com/mwilliamson/mammoth.js)**: Used for reliably extracting raw text from Word (`.docx`) documents [cite: 1, 2].

## Getting Started

### Prerequisites
Since this is a fully client-side application, all you need is a modern web browser (e.g., Chrome, Firefox, Safari, Edge).

### Installation & Usage
1. Clone or download the project files to your local machine.
2. Ensure the three core files are in the same directory:
   * `index.html`
   * `style.css`
   * `script.js`
3. Open `index.html` in your web browser [cite: 1].
4. Paste your target **Job Description** into the provided text area [cite: 1].
5. **Upload Resumes** by dragging and dropping `.pdf` or `.docx` files into the designated drop zone, or click to browse your files [cite: 1].
6. Click the **"Screen Candidates"** button [cite: 1].
7. View the ranked results, complete with match percentages and colored visual score bars indicating candidate suitability [cite: 2, 3].

## How It Works Under the Hood
1. **Text Extraction**: When files are uploaded, `pdf.js` and `mammoth.js` read the file buffers to extract the raw text [cite: 2].
2. **Tokenization**: The extracted text is converted to lowercase, stripped of non-alphanumeric characters, and filtered against a set of common stop words to retain only meaningful keywords [cite: 2].
3. **Vectorization**: The script calculates the Term Frequency (TF) for each document and the Inverse Document Frequency (IDF) across all uploaded documents plus the job description [cite: 2].
4. **Similarity Scoring**: A Cosine Similarity score is computed between the job description vector and each resume vector [cite: 2]. The final percentage determines whether the candidate is ranked as a high (>=25%), medium (>=10%), or low match [cite: 2].
