CREATE TABLE products (
  id INTEGER PRIMARY KEY,
  file_key TEXT NOT NULL
);

CREATE TABLE orders (
  id INTEGER PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id),
  status TEXT NOT NULL
);

CREATE TABLE downloads (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id),
  token TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL
);
