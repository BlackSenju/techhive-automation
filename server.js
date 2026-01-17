const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const axios = require('axios');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Shopify Configuration
const SHOPIFY_STORE = process.env.SHOPIFY_STORE;
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const SHOPIFY_API_VERSION = '2024-01';

// In-memory store for automation logs
const automationLogs = [];

// Middleware
app.use(cors());
app.use(express.json());

// Shopify API Helper
const shopifyAPI = axios.create({
      baseURL: `https://${SHOPIFY_STORE}/admin/api/${SHOPIFY_API_VERSION}`,
      headers: {
              'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
              'Content-Type': 'application/json'
      }
});

// Helper function to log automation activities
function logActivity(action, details, status = 'success') {
      const entry = {
              timestamp: new Date().toISOString(),
              action,
              details,
              status
      };
      automationLogs.unshift(entry);
      if (automationLogs.length > 100) automationLogs.pop();
      console.log(`[${status.toUpperCase()}] ${action}:`, details);
}

// ===================
// SHOPIFY API ENDPOINTS
// ===================

// Get all products
app.get('/api/products', async (req, res) => {
      try {
              if (!SHOPIFY_STORE || !SHOPIFY_ACCESS_TOKEN) {
                        return res.json({ message: 'Shopify not configured. Set SHOPIFY_STORE and SHOPIFY_ACCESS_TOKEN env vars.', products: [] });
              }
              const response = await shopifyAPI.get('/products.json?limit=250');
              logActivity('fetch_products', `Fetched ${response.data.products.length} products`);
              res.json({ products: response.data.products });
      } catch (error) {
              logActivity('fetch_products', error.message, 'error');
              res.status(500).json({ error: error.message });
      }
});

// Get single product
app.get('/api/products/:id', async (req, res) => {
      try {
              const response = await shopifyAPI.get(`/products/${req.params.id}.json`);
              res.json(response.data);
      } catch (error) {
              res.status(500).json({ error: error.message });
      }
});

// Update product
app.put('/api/products/:id', async (req, res) => {
      try {
              const response = await shopifyAPI.put(`/products/${req.params.id}.json`, { product: req.body });
              logActivity('update_product', `Updated product ${req.params.id}`);
              res.json(response.data);
      } catch (error) {
              logActivity('update_product', error.message, 'error');
              res.status(500).json({ error: error.message });
      }
});

// Bulk update products
app.post('/api/bulk-edit', async (req, res) => {
      const { productIds, updates } = req.body;
      const results = [];

           for (const id of productIds || []) {
                   try {
                             const response = await shopifyAPI.put(`/products/${id}.json`, { product: updates });
                             results.push({ id, status: 'success' });
                             logActivity('bulk_update', `Updated product ${id}`);
                   } catch (error) {
                             results.push({ id, status: 'error', error: error.message });
                             logActivity('bulk_update', `Failed to update ${id}: ${error.message}`, 'error');
                   }
           }

           res.json({ results, total: productIds?.length || 0, successful: results.filter(r => r.status === 'success').length });
});

// ===================
// AUTOMATION FEATURES
// ===================

// Auto-optimize product titles (remove extra spaces, capitalize properly)
async function optimizeTitles() {
      if (!SHOPIFY_STORE || !SHOPIFY_ACCESS_TOKEN) return;

  try {
          const response = await shopifyAPI.get('/products.json?limit=250');
          const products = response.data.products;
          let optimized = 0;

        for (const product of products) {
                  const originalTitle = product.title;
                  const optimizedTitle = originalTitle
                    .replace(/\s+/g, ' ')
                    .trim()
                    .split(' ')
                    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
                    .join(' ');

            if (originalTitle !== optimizedTitle) {
                        await shopifyAPI.put(`/products/${product.id}.json`, {
                                      product: { title: optimizedTitle }
                        });
                        optimized++;
                        logActivity('auto_optimize_title', `${originalTitle} -> ${optimizedTitle}`);
            }
        }

        logActivity('title_optimization_complete', `Optimized ${optimized} product titles`);
  } catch (error) {
          logActivity('title_optimization', error.message, 'error');
  }
}

// Auto-update inventory status tags
async function updateInventoryTags() {
      if (!SHOPIFY_STORE || !SHOPIFY_ACCESS_TOKEN) return;

  try {
          const response = await shopifyAPI.get('/products.json?limit=250');
          const products = response.data.products;
          let updated = 0;

        for (const product of products) {
                  const totalInventory = product.variants.reduce((sum, v) => sum + (v.inventory_quantity || 0), 0);
                  let newTags = product.tags.split(',').map(t => t.trim()).filter(t => !t.startsWith('stock-'));

            if (totalInventory === 0) {
                        newTags.push('stock-out');
            } else if (totalInventory < 10) {
                        newTags.push('stock-low');
            } else {
                        newTags.push('stock-available');
            }

            const updatedTags = newTags.join(', ');
                  if (product.tags !== updatedTags) {
                              await shopifyAPI.put(`/products/${product.id}.json`, {
                                            product: { tags: updatedTags }
                              });
                              updated++;
                              logActivity('auto_inventory_tag', `Product ${product.id}: ${updatedTags}`);
                  }
        }

        logActivity('inventory_tagging_complete', `Updated ${updated} product tags`);
  } catch (error) {
          logActivity('inventory_tagging', error.message, 'error');
  }
}

// Auto-generate SEO descriptions
async function generateSEODescriptions() {
      if (!SHOPIFY_STORE || !SHOPIFY_ACCESS_TOKEN) return;

  try {
          const response = await shopifyAPI.get('/products.json?limit=250');
          const products = response.data.products;
          let updated = 0;

        for (const product of products) {
                  if (!product.body_html || product.body_html.length < 50) {
                              const seoDescription = `Shop ${product.title} at TechHive. ${product.product_type ? `Category: ${product.product_type}.` : ''} ${product.vendor ? `Brand: ${product.vendor}.` : ''} Fast shipping and great prices!`;

                    await shopifyAPI.put(`/products/${product.id}.json`, {
                                  product: { body_html: seoDescription }
                    });
                              updated++;
                              logActivity('auto_seo', `Generated description for ${product.title}`);
                  }
        }

        logActivity('seo_generation_complete', `Generated ${updated} SEO descriptions`);
  } catch (error) {
          logActivity('seo_generation', error.message, 'error');
  }
}

// ===================
// SCHEDULED TASKS
// ===================

// Run title optimization daily at 2 AM
cron.schedule('0 2 * * *', () => {
      logActivity('scheduled_task', 'Running daily title optimization');
      optimizeTitles();
});

// Run inventory tagging every 6 hours
cron.schedule('0 */6 * * *', () => {
      logActivity('scheduled_task', 'Running inventory tag update');
      updateInventoryTags();
});

// Run SEO generation weekly on Sunday at 3 AM
cron.schedule('0 3 * * 0', () => {
      logActivity('scheduled_task', 'Running weekly SEO generation');
      generateSEODescriptions();
});

// ===================
// MANUAL TRIGGER ENDPOINTS
// ===================

app.post('/api/automation/optimize-titles', async (req, res) => {
      optimizeTitles();
      res.json({ message: 'Title optimization started' });
});

app.post('/api/automation/update-inventory-tags', async (req, res) => {
      updateInventoryTags();
      res.json({ message: 'Inventory tag update started' });
});

app.post('/api/automation/generate-seo', async (req, res) => {
      generateSEODescriptions();
      res.json({ message: 'SEO generation started' });
});

app.post('/api/automation/run-all', async (req, res) => {
      logActivity('manual_trigger', 'Running all automation tasks');
      optimizeTitles();
      updateInventoryTags();
      generateSEODescriptions();
      res.json({ message: 'All automation tasks started' });
});

// Get automation logs
app.get('/api/automation/logs', (req, res) => {
      res.json({ logs: automationLogs });
});

// ===================
// CORE ENDPOINTS
// ===================

app.get('/health', (req, res) => {
      res.status(200).json({ 
                               status: 'healthy', 
              timestamp: new Date().toISOString(),
              shopifyConfigured: !!(SHOPIFY_STORE && SHOPIFY_ACCESS_TOKEN)
      });
});

app.get('/', (req, res) => {
      res.json({
              name: 'TechHive Automation',
              version: '2.0.0',
              description: 'Fully autonomous Shopify product optimizer',
              shopifyConfigured: !!(SHOPIFY_STORE && SHOPIFY_ACCESS_TOKEN),
              endpoints: {
                        products: {
                                    list: 'GET /api/products',
                                    get: 'GET /api/products/:id',
                                    update: 'PUT /api/products/:id',
                                    bulkEdit: 'POST /api/bulk-edit'
                        },
                        automation: {
                                    optimizeTitles: 'POST /api/automation/optimize-titles',
                                    updateInventoryTags: 'POST /api/automation/update-inventory-tags',
                                    generateSEO: 'POST /api/automation/generate-seo',
                                    runAll: 'POST /api/automation/run-all',
                                    logs: 'GET /api/automation/logs'
                        },
                        system: {
                                    health: 'GET /health'
                        }
              },
              scheduledTasks: {
                        titleOptimization: 'Daily at 2:00 AM',
                        inventoryTagging: 'Every 6 hours',
                        seoGeneration: 'Weekly on Sunday at 3:00 AM'
              }
      });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
      console.log(`TechHive Automation v2.0.0 running on port ${PORT}`);
      console.log(`Shopify configured: ${!!(SHOPIFY_STORE && SHOPIFY_ACCESS_TOKEN)}`);
      logActivity('server_start', `Server started on port ${PORT}`);
});
