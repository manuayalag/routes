-- Crear tablas para el dashboard de rutas
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Tabla de usuarios/vendedores
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    full_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de clientes (subjects)
CREATE TABLE IF NOT EXISTS subject (
    id SERIAL PRIMARY KEY,
    code VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Relación vendedor-cliente
CREATE TABLE IF NOT EXISTS subject_user (
    id SERIAL PRIMARY KEY,
    subject_id INTEGER REFERENCES subject(id),
    user_id INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de rutas
CREATE TABLE IF NOT EXISTS route (
    id SERIAL PRIMARY KEY,
    creation_date DATE NOT NULL,
    user_id INTEGER REFERENCES users(id),
    group_id INTEGER,
    route_distance DECIMAL(10, 2),
    status VARCHAR(50) DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Detalles de rutas
CREATE TABLE IF NOT EXISTS route_detail (
    id SERIAL PRIMARY KEY,
    route_id INTEGER REFERENCES route(id),
    subject_name VARCHAR(255),
    subject_code VARCHAR(50),
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    invoice_amount DECIMAL(12, 2) DEFAULT 0,
    invoice_quantity INTEGER DEFAULT 0,
    order_amount DECIMAL(12, 2) DEFAULT 0,
    order_quantity INTEGER DEFAULT 0,
    receipt_amount DECIMAL(12, 2) DEFAULT 0,
    receipt_quantity INTEGER DEFAULT 0,
    visit_positive BOOLEAN DEFAULT FALSE,
    sequence INTEGER,
    visit_sequence INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Vista para usuarios (replicando v_users de tu consulta)
CREATE OR REPLACE VIEW v_users AS
SELECT id, full_name, email FROM users;

-- Datos de ejemplo
INSERT INTO users (full_name, email) VALUES 
('Juan Pérez', 'juan.perez@empresa.com'),
('María García', 'maria.garcia@empresa.com'),
('Carlos López', 'carlos.lopez@empresa.com')
ON CONFLICT (email) DO NOTHING;

INSERT INTO subject (code, name, latitude, longitude) VALUES 
('CLI001', 'Cliente A', -34.6037, -58.3816),
('CLI002', 'Cliente B', -34.6118, -58.3960),
('CLI003', 'Cliente C', -34.5875, -58.3974),
('CLI004', 'Cliente D', -34.6092, -58.3731),
('CLI005', 'Cliente E', -34.5998, -58.3823)
ON CONFLICT (code) DO NOTHING;

INSERT INTO subject_user (subject_id, user_id) VALUES 
(1, 1), (2, 1), (3, 2), (4, 2), (5, 3)
ON CONFLICT DO NOTHING;

INSERT INTO route (creation_date, user_id, group_id, route_distance, status) VALUES 
('2025-09-17', 1, 1, 45.5, 'completed'),
('2025-09-16', 2, 1, 32.8, 'completed'),
('2025-09-15', 1, 1, 52.3, 'completed')
ON CONFLICT DO NOTHING;

INSERT INTO route_detail (route_id, subject_name, subject_code, latitude, longitude, invoice_amount, invoice_quantity, order_amount, order_quantity, receipt_amount, receipt_quantity, visit_positive, sequence, visit_sequence) VALUES 
(1, 'Cliente A', 'CLI001', -34.6037, -58.3816, 1500.00, 3, 2000.00, 5, 1200.00, 2, true, 1, 1),
(1, 'Cliente B', 'CLI002', -34.6118, -58.3960, 800.00, 2, 1200.00, 3, 600.00, 1, true, 2, 2),
(2, 'Cliente C', 'CLI003', -34.5875, -58.3974, 2200.00, 4, 2800.00, 6, 1800.00, 3, true, 1, 1),
(2, 'Cliente D', 'CLI004', -34.6092, -58.3731, 950.00, 2, 1100.00, 3, 700.00, 1, false, 2, 2),
(3, 'Cliente E', 'CLI005', -34.5998, -58.3823, 1750.00, 5, 2100.00, 7, 1400.00, 4, true, 1, 1)
ON CONFLICT DO NOTHING;