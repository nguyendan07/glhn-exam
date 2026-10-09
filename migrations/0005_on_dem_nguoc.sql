ALTER TABLE cau_hinh ADD COLUMN on_dem_nguoc INTEGER NOT NULL DEFAULT 1 CHECK (on_dem_nguoc IN (0, 1));
