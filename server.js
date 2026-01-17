const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Health check endpoint for Fly.io
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Root endpoint
app.get('/', (req, res) => {
    res.json({
          name: 'TechHive Automation',
          version: '1.0.0',
          description: 'Shopify app for TechHive store automation - Product optimizer with bulk editing capabilities',
          endpoints: {
                  health: '/health',
                  products: '/api/products',
                  bulkEdit: '/api/bulk-edit'
          }
    });
});

// Products API placeholder
app.get('/api/products', (req, res) => {
    res.json({
          message: 'Products endpoint ready',
          products: []
    });
});

// Bulk edit API placeholder
app.post('/api/bulk-edit', (req, res) => {
    const { productIds, updates } = req.body;
    res.json({
          message: 'Bulk edit endpoint ready',
          received: { productIds, updates }
    });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`TechHive Automation server running on port ${PORT}`);
});
