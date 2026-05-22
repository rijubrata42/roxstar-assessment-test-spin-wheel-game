CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  role VARCHAR(10) DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  coin_balance INTEGER DEFAULT 0 CHECK (coin_balance >= 0),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE spin_wheels (
  id SERIAL PRIMARY KEY,
  created_by INTEGER REFERENCES users(id),
  entry_fee INTEGER NOT NULL,
  status VARCHAR(20) DEFAULT 'waiting'
    CHECK (status IN ('waiting', 'running', 'completed', 'aborted')),
  winner_id INTEGER REFERENCES users(id),
  winner_pool INTEGER DEFAULT 0,
  admin_pool INTEGER DEFAULT 0,
  app_pool INTEGER DEFAULT 0,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE participants (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  spin_wheel_id INTEGER REFERENCES spin_wheels(id),
  is_eliminated BOOLEAN DEFAULT false,
  elimination_order INTEGER,
  joined_at TIMESTAMP DEFAULT NOW(),
  eliminated_at TIMESTAMP,
  UNIQUE(user_id, spin_wheel_id)  -- prevents double joining
);

CREATE TABLE transactions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  spin_wheel_id INTEGER REFERENCES spin_wheels(id),
  type VARCHAR(20) NOT NULL
    CHECK (type IN ('entry_fee', 'refund', 'winning', 'admin_payout')),
  amount INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE config (
  id SERIAL PRIMARY KEY,
  key VARCHAR(50) UNIQUE NOT NULL,
  value VARCHAR(100) NOT NULL
);

INSERT INTO config (key, value) VALUES
  ('winner_percentage', '70'),
  ('admin_percentage', '20'),
  ('app_percentage', '10');

INSERT INTO users (username, role, coin_balance) VALUES
  ('admin1', 'admin', 10000),
  ('player1', 'user', 1000),
  ('player2', 'user', 1000),
  ('player3', 'user', 1000),
  ('player4', 'user', 1000);