/**
 * Inventory API functions
 * Replace the baseURL with your actual API endpoint.
 */

const baseURL = '/api/inventory';

/**
 * Fetch all inventory items.
 */
export async function fetchInventory() {
    const response = await fetch(baseURL);
    if (!response.ok) {
        throw new Error('Failed to fetch inventory');
    }
    return response.json();
}

/**
 * Fetch a single inventory item by ID.
 * @param {string|number} id
 */
export async function fetchInventoryItem(id) {
    const response = await fetch(`${baseURL}/${id}`);
    if (!response.ok) {
        throw new Error('Failed to fetch inventory item');
    }
    return response.json();
}

/**
 * Create a new inventory item.
 * @param {Object} itemData
 */
export async function createInventoryItem(itemData) {
    const response = await fetch(baseURL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(itemData),
    });
    if (!response.ok) {
        throw new Error('Failed to create inventory item');
    }
    return response.json();
}

/**
 * Update an existing inventory item.
 * @param {string|number} id
 * @param {Object} itemData
 */
export async function updateInventoryItem(id, itemData) {
    const response = await fetch(`${baseURL}/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(itemData),
    });
    if (!response.ok) {
        throw new Error('Failed to update inventory item');
    }
    return response.json();
}

/**
 * Delete an inventory item.
 * @param {string|number} id
 */
export async function deleteInventoryItem(id) {
    const response = await fetch(`${baseURL}/${id}`, {
        method: 'DELETE',
    });
    if (!response.ok) {
        throw new Error('Failed to delete inventory item');
    }
    return response.json();
}

/**
 * Fetch all products.
 */
export async function getProducts() {
    const res = await fetch("http://127.0.0.1:8000/products/");
    if (!res.ok) throw new Error("Failed to fetch products");
    return res.json();
}

/**
 * Create a new product.
 * @param {Object} productData
 */
export async function createProduct(productData) {
    const res = await fetch("http://127.0.0.1:8000/products/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(productData),
    });
    if (!res.ok) throw new Error(await res.text());
    return await res.json();
}

/**
 * Get a single product by ID.
 * @param {string|number} id
 */
export async function getProduct(id) {
    const res = await fetch(`http://127.0.0.1:8000/products/${id}`);
    if (!res.ok) throw new Error(await res.text());
    return await res.json();
}

/**
 * Update a product.
 * @param {string|number} id
 * @param {Object} data
 */
export async function updateProduct(id, data) {
    const res = await fetch(`http://127.0.0.1:8000/products/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error(await res.text());
    return await res.json();
}