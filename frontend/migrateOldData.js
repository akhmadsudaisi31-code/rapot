require('dotenv').config({ path: './.env' });
const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs, doc, setDoc, updateDoc } = require('firebase/firestore');

// Use hardcoded config if .env fails or read from src/firebase.js (Wait, I can just use fs to read it)
