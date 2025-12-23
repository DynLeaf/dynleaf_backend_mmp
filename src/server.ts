import app from './app.js';
import connectDB from './config/db.js';

const PORT = process.env.PORT || 4000;

// Helpful process-level handlers for development
process.on('unhandledRejection', (reason) => {
    console.error('Unhandled Rejection:', reason);
});

process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
    process.exit(1);
});

console.log('Starting DB connection...');
connectDB().then(() => {
    app.listen(PORT, () => {
        console.log(`Server is running in ${process.env.NODE_ENV} mode on port ${PORT}`);
    });
}).catch(err => {
    console.error('Failed to connect DB:', err);
    process.exit(1);
});
