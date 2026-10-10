const admin = require('firebase-admin');

// Initialize the app. If GOOGLE_APPLICATION_CREDENTIALS is set, it uses that.
// Or we can try to initialize without credentials and see if it works from the CLI environment.
admin.initializeApp({
  projectId: 'newnewton'
});

const db = admin.firestore();

async function testWrite() {
  try {
    console.log("Testing Firestore write...");
    const ref = db.collection('quizzes').doc('test-doc-123');
    await ref.set({
      test: true,
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });
    console.log("Write successful!");
  } catch (error) {
    console.error("Write failed:", error);
  }
}

testWrite();
