import pandas as pd
import numpy as np
import json
import os
from datetime import datetime

def clean_data(df):
    print("Executing data cleaning activities...")
    
    # 1. Duplicate Removal
    initial_rows = len(df)
    df = df.drop_duplicates(subset=['Order ID'])
    removed_dupes = initial_rows - len(df)
    print(f"  - Removed {removed_dupes} duplicate rows.")

    # 2. Date Formatting and Validation
    df['Order Date'] = pd.to_datetime(df['Order Date'])
    df['Year'] = df['Order Date'].dt.year.astype(int)
    df['Quarter'] = df['Order Date'].dt.to_period('Q').astype(str).str[-2:] # Q1, Q2, etc.
    df['Month'] = df['Order Date'].dt.strftime('%B')
    print("  - Standardized Order Date and verified Year, Quarter, Month columns.")

    # 3. Product Category Standardization
    # Clean whitespace and standardize values
    df['Product Category'] = df['Product Category'].astype(str).str.strip()
    
    category_map = {
        'elect': 'Electronics',
        'elec': 'Electronics',
        'fashi': 'Fashion',
        'fash': 'Fashion',
        'home': 'Home & Kitchen',
        'sport': 'Sports & Outdoors',
        'beaut': 'Beauty & Personal Care'
    }
    
    def standardize_cat(cat):
        cat_lower = cat.lower()
        for key, val in category_map.items():
            if cat_lower.startswith(key):
                return val
        return cat

    df['Product Category'] = df['Product Category'].apply(standardize_cat)
    print(f"  - Standardized Product Category columns. Unique categories: {df['Product Category'].unique()}")

    # 4. Data Validation (Sales Amount check)
    calculated_sales = np.round(df['Units Sold'] * df['Unit Price'] * (1 - df['Discount %'] / 100.0), 2)
    mismatch_mask = np.abs(df['Sales Amount'] - calculated_sales) > 0.05
    mismatches = mismatch_mask.sum()
    if mismatches > 0:
        df.loc[mismatch_mask, 'Sales Amount'] = calculated_sales[mismatch_mask]
        df.loc[mismatch_mask, 'Actual Sales'] = calculated_sales[mismatch_mask]
        print(f"  - Rectified {mismatches} rounding inconsistencies in Sales Amount.")

    # 5. Missing Value Treatment (Marketing Spend)
    category_mktg_ratio = {}
    for cat in df['Product Category'].unique():
        cat_subset = df[df['Product Category'] == cat]
        valid_mktg = cat_subset['Marketing Spend'].dropna()
        valid_sales = cat_subset.loc[valid_mktg.index, 'Sales Amount']
        if len(valid_sales) > 0:
            category_mktg_ratio[cat] = (valid_mktg / valid_sales).mean()
        else:
            category_mktg_ratio[cat] = 0.05

    missing_count = df['Marketing Spend'].isna().sum()
    if missing_count > 0:
        def impute_marketing(row):
            if pd.isna(row['Marketing Spend']):
                ratio = category_mktg_ratio.get(row['Product Category'], 0.05)
                return round(row['Sales Amount'] * ratio, 2)
            return row['Marketing Spend']
        
        df['Marketing Spend'] = df.apply(impute_marketing, axis=1)
        print(f"  - Imputed {missing_count} missing values in Marketing Spend using category ratios.")

    # 6. Outlier Detection
    units_mean = df['Units Sold'].mean()
    units_std = df['Units Sold'].std()
    outlier_threshold = units_mean + 3 * units_std
    df['Is_Outlier'] = df['Units Sold'] > outlier_threshold
    print(f"  - Tagged {df['Is_Outlier'].sum()} transaction outliers (Units Sold > {outlier_threshold:.1f}).")

    return df

def generate_cubes(df):
    print("Aggregating metrics into multidimensional cubes...")
    
    # Pre-calculate helper columns for aggregation
    df['Is_Over'] = (df['Forecasted Sales'] > df['Actual Sales']).astype(int)
    df['Is_Under'] = (df['Forecasted Sales'] <= df['Actual Sales']).astype(int)
    
    # 1. MAIN_CUBE
    # Group by Year, Season, Month, Region, Category, Demand
    # Rename columns to match JS expectations:
    # Product Category -> Category, Demand Level -> Demand, Sales Amount -> Sales
    print("  - Creating MAIN_CUBE...")
    main_group = df.groupby([
        'Year', 'Season', 'Month', 'Region', 'Product Category', 'Demand Level'
    ]).agg({
        'Sales Amount': 'sum',
        'Order ID': 'count', # Count of transactions
        'Forecast Error %': 'mean',
        'Stock Available': 'mean',
        'Marketing Spend': 'sum',
        'Is_Over': 'sum',
        'Is_Under': 'sum'
    }).reset_index()
    
    main_group.columns = [
        'Year', 'Season', 'Month', 'Region', 'Category', 'Demand',
        'Sales', 'Orders', 'FcstErr', 'Stock', 'Marketing', 'Over', 'Under'
    ]
    
    # Round floats for JSON size optimization
    main_group['Sales'] = np.round(main_group['Sales'].astype(float), 2)
    main_group['FcstErr'] = np.round(main_group['FcstErr'].astype(float), 2)
    main_group['Stock'] = np.round(main_group['Stock'].astype(float), 1)
    main_group['Marketing'] = np.round(main_group['Marketing'].astype(float), 2)
    main_group['Year'] = main_group['Year'].astype(int)
    main_group['Orders'] = main_group['Orders'].astype(int)
    main_group['Over'] = main_group['Over'].astype(int)
    main_group['Under'] = main_group['Under'].astype(int)
    
    main_cube_list = main_group.to_dict(orient='records')
    
    # 2. PRODUCT_CUBE
    # Group by Product Name, Category, Region, Demand Level, Year, Month
    print("  - Creating PRODUCT_CUBE...")
    product_group = df.groupby([
        'Product Name', 'Product Category', 'Region', 'Demand Level', 'Year', 'Month'
    ]).agg({
        'Units Sold': 'sum',
        'Stock Available': 'mean',
        'Sales Amount': 'sum'
    }).reset_index()
    
    product_group.columns = [
        'Product', 'Category', 'Region', 'Demand', 'Year', 'Month',
        'Units', 'Stock', 'Sales'
    ]
    
    product_group['Units'] = product_group['Units'].astype(int)
    product_group['Stock'] = np.round(product_group['Stock'].astype(float), 1)
    product_group['Sales'] = np.round(product_group['Sales'].astype(float), 2)
    product_group['Year'] = product_group['Year'].astype(int)
    
    # To keep file size very reasonable, let's keep the top 1000 product-sliced records or all of them.
    # 105k rows grouped by product-region-demand-year-month will have around 3000 rows. This is very small!
    product_cube_list = product_group.to_dict(orient='records')
    
    # 3. CITY_CUBE
    # Group by City, Region, Category, Year, Month
    print("  - Creating CITY_CUBE...")
    city_group = df.groupby([
        'City', 'Region', 'Product Category', 'Year', 'Month'
    ]).agg({
        'Sales Amount': 'sum'
    }).reset_index()
    
    city_group.columns = [
        'City', 'Region', 'Category', 'Year', 'Month', 'Sales'
    ]
    
    city_group['Sales'] = np.round(city_group['Sales'].astype(float), 2)
    city_group['Year'] = city_group['Year'].astype(int)
    
    city_cube_list = city_group.to_dict(orient='records')
    
    # Write to js/data.js
    os.makedirs('js', exist_ok=True)
    with open('js/data.js', 'w', encoding='utf-8') as f:
        f.write("// AUTO-GENERATED DATA CUBES FROM CLEANED TRANSACTIONS\n")
        f.write(f"const MAIN_CUBE = {json.dumps(main_cube_list)};\n\n")
        f.write(f"const PRODUCT_CUBE = {json.dumps(product_cube_list)};\n\n")
        f.write(f"const CITY_CUBE = {json.dumps(city_cube_list)};\n")
        
    print(f"  - Successfully wrote js/data.js. Sizes: MAIN_CUBE={len(main_cube_list)} rows, PRODUCT_CUBE={len(product_cube_list)} rows, CITY_CUBE={len(city_cube_list)} rows.")

    # Centralize and write to data/dashboard_data.json
    os.makedirs('data', exist_ok=True)
    json_path = 'data/dashboard_data.json'
    json_data = {}
    if os.path.exists(json_path):
        try:
            with open(json_path, 'r', encoding='utf-8') as f:
                json_data = json.load(f)
        except Exception as e:
            print(f"  - Warning: Could not load existing {json_path}: {e}")

    json_data['main_cube'] = main_cube_list
    json_data['product_cube'] = product_cube_list
    json_data['city_cube'] = city_cube_list

    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(json_data, f, ensure_ascii=False, indent=2)
    print(f"  - Successfully updated {json_path} with structured data cubes.")

def main():
    print("Starting process_data.py execution...")
    
    if not os.path.exists('data/sales_data.csv'):
        print("Error: 'data/sales_data.csv' not found. Please run generate_data.py first.")
        return
        
    df = pd.read_csv('data/sales_data.csv')
    print(f"Successfully loaded {len(df)} records from 'data/sales_data.csv'.")
    
    df_cleaned = clean_data(df)
    
    # Save cleaned csv
    os.makedirs('data', exist_ok=True)
    df_cleaned.to_csv('data/cleaned_sales_data.csv', index=False)
    print(f"Successfully saved clean dataset to 'data/cleaned_sales_data.csv'.")
    
    # Generate data cubes javascript
    generate_cubes(df_cleaned)
    print("process_data.py execution finished successfully!")

if __name__ == "__main__":
    main()
