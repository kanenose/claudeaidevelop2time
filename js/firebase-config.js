const firebaseConfig = {
  apiKey:            "AIzaSyBbyTa-ZIgp1qzS3zfrkEROm43W1QnhaEo",
  authDomain:        "claudewebsite-ff776.firebaseapp.com",
  projectId:         "claudewebsite-ff776",
  storageBucket:     "claudewebsite-ff776.firebasestorage.app",
  messagingSenderId: "271989560910",
  appId:             "1:271989560910:web:bd683463843b03262e551f"
};

firebase.initializeApp(firebaseConfig);
const auth       = firebase.auth();
const db         = firebase.firestore();
const storage    = firebase.storage();
const FieldValue = firebase.firestore.FieldValue;
