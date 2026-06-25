import pandas as pd
import numpy as np
import os
from datetime import datetime, timedelta

def main():
    print("Starting raw sales dataset generation (100,000+ records)...")
    np.random.seed(42)  # For reproducibility

    # Define dimensions
    regions = ['North', 'South', 'East', 'West', 'Central']
    region_weights = [0.25, 0.20, 0.22, 0.23, 0.10]
    
    cities_by_region = {
        'North': ['New York', 'Boston', 'Chicago'],
        'South': ['Miami', 'Atlanta', 'Dallas'],
        'East': ['Philadelphia', 'Washington DC', 'Baltimore'],
        'West': ['Los Angeles', 'San Francisco', 'Seattle'],
        'Central': ['Denver', 'Kansas City', 'Detroit']
    }

    products_by_category = {
        'Electronics': {
            'Smart Watch': 199.99,
            'Wireless Headphones': 149.99,
            'Bluetooth Speaker': 79.99,
            'Tablet': 329.99,
            'Laptop': 999.99
        },
        'Fashion': {
            'Leather Jacket': 120.00,
            'Running Shoes': 85.00,
            'Designer Sunglasses': 150.00,
            'Denim Jeans': 60.00,
            'Classic Watch': 250.00
        },
        'Home & Kitchen': {
            'Air Fryer': 99.99,
            'Coffee Maker': 89.99,
            'Robot Vacuum': 249.99,
            'Blender': 49.99,
            'Ergonomic Chair': 180.00
        },
        'Sports & Outdoors': {
            'Yoga Mat': 25.00,
            'Camping Tent': 150.00,
            'Dumbbell Set': 50.00,
            'Water Bottle': 19.99,
            'Mountain Bike': 450.00
        },
        'Beauty & Personal Care': {
            'Face Serum': 45.00,
            'Electric Toothbrush': 79.99,
            'Hair Dryer': 59.99,
            'Perfume': 85.00,
            'Sunscreen': 20.00
        }
    }

    categories = list(products_by_category.keys())
    
    # Generate 105,000 rows to ensure we are well over 100k
    n_rows = 105000
    
    # Generate dates with seasonality weights (high Q4, mid summer, dip Q1)
    start_date = datetime(2021, 1, 1)
    end_date = datetime(2025, 12, 31)
    total_days = (end_date - start_date).days + 1
    
    # Probability distribution for months (Q4 high, Jan-Feb low)
    month_weights = {
        1: 0.6,  # Jan
        2: 0.6,  # Feb
        3: 0.8,  # Mar
        4: 0.9,  # Apr
        5: 1.0,  # May
        6: 1.1,  # Jun
        7: 1.1,  # Jul
        8: 1.0,  # Aug
        9: 0.9,  # Sep
        10: 1.1, # Oct
        11: 1.4, # Nov
        12: 1.6  # Dec
    }
    
    print("Simulating order dates based on retail seasonality...")
    # Pre-calculate probability for every single day in the 5 year range
    day_list = [start_date + timedelta(days=i) for i in range(total_days)]
    day_weights = [month_weights[d.month] for d in day_list]
    day_weights = np.array(day_weights) / sum(day_weights)
    
    chosen_dates = np.random.choice(day_list, size=n_rows, p=day_weights)
    chosen_dates.sort()  # Sort chronologically

    # Pre-allocate arrays for performance
    order_ids = [f"ORD{i:06d}" for i in range(100001, 100001 + n_rows)]
    
    # Regions
    chosen_regions = np.random.choice(regions, size=n_rows, p=region_weights)
    
    # Cities based on region
    chosen_cities = []
    for reg in chosen_regions:
        cities = cities_by_region[reg]
        chosen_cities.append(np.random.choice(cities))
        
    # Categories
    chosen_categories = np.random.choice(categories, size=n_rows)
    
    # Products and Prices
    chosen_products = []
    unit_prices = []
    
    # Flatten categories/products to choose from
    product_pool = {}
    for cat, prods in products_by_category.items():
        product_pool[cat] = list(prods.keys())
        
    for cat in chosen_categories:
        prod_list = product_pool[cat]
        prod = np.random.choice(prod_list)
        chosen_products.append(prod)
        unit_prices.append(products_by_category[cat][prod])
        
    unit_prices = np.array(unit_prices)
    
    # Units Sold - lower for expensive items, higher for cheaper items
    print("Generating purchase quantities and prices...")
    units_sold = []
    for price in unit_prices:
        if price > 400:
            units = np.random.choice([1, 2, 3], p=[0.8, 0.15, 0.05])
        elif price > 100:
            units = np.random.randint(1, 5)
        else:
            units = np.random.randint(1, 11)
        units_sold.append(units)
    units_sold = np.array(units_sold)
    
    # Discount % (0% discount is most common, others up to 30%)
    discounts = np.random.choice([0.0, 0.05, 0.10, 0.15, 0.20, 0.30], size=n_rows, p=[0.5, 0.15, 0.15, 0.10, 0.06, 0.04])
    
    # Gross and net sales
    gross_sales = units_sold * unit_prices
    sales_amount = np.round(gross_sales * (1 - discounts), 2)
    
    # Marketing spend (2% to 10% of sales amount, with random variance)
    marketing_spend = np.round(sales_amount * np.random.uniform(0.02, 0.10, size=n_rows), 2)
    
    # Stock Available - simulated to show overstock and stockout risk
    # Expensive / low volume: low stock (0-20)
    # Cheaper / high volume: higher stock (50-300)
    # Introducing intentional stockouts (stock = 0) and overstock (stock > 200 for low units sold)
    print("Generating inventory stock levels...")
    stock_available = []
    for u, price in zip(units_sold, unit_prices):
        if price > 400:
            stock = np.random.choice([0, 1, 2, 5, 10, 15, 30], p=[0.05, 0.05, 0.10, 0.30, 0.30, 0.15, 0.05])
        else:
            # Randomly create some overstock or stockout scenarios
            rand_val = np.random.rand()
            if rand_val < 0.04:  # 4% chance of stockout (stock = 0)
                stock = 0
            elif rand_val > 0.95:  # 5% chance of overstock
                stock = np.random.randint(250, 500)
            else:
                stock = np.random.randint(10, 150)
        stock_available.append(stock)
    stock_available = np.array(stock_available)
    
    # Demand Level based on units sold
    # High: units_sold > 7, Medium: 3-7, Low: < 3
    demand_levels = []
    for u in units_sold:
        if u > 7:
            demand_levels.append('High')
        elif u >= 3:
            demand_levels.append('Medium')
        else:
            demand_levels.append('Low')
            
    # Season based on month
    # Dec, Jan, Feb -> Winter
    # Mar, Apr, May -> Spring
    # Jun, Jul, Aug -> Summer
    # Sep, Oct, Nov -> Autumn
    seasons = []
    for d in chosen_dates:
        m = d.month
        if m in [12, 1, 2]:
            seasons.append('Winter')
        elif m in [3, 4, 5]:
            seasons.append('Spring')
        elif m in [6, 7, 8]:
            seasons.append('Summer')
        else:
            seasons.append('Autumn')

    # Date components
    months = [d.strftime('%B') for d in chosen_dates]
    quarters = [f"Q{(d.month-1)//3 + 1}" for d in chosen_dates]
    years = [d.year for d in chosen_dates]
    formatted_dates = [d.strftime('%Y-%m-%d') for d in chosen_dates]
    
    # Forecasting metrics: Actual vs Forecasted
    # Actual Sales (order level) = sales_amount
    # Previous Month Sales = Actual Sales * random shift (0.85 to 1.15)
    # Forecasted Sales = Actual Sales * random shift representing forecast model (MAPE target 6-8%)
    # Let's add minor seasonal bias to forecast (e.g. under-forecast Q4 spikes slightly)
    print("Generating forecasting metrics...")
    prev_month_sales = []
    forecasted_sales = []
    
    for val, d in zip(sales_amount, chosen_dates):
        # Previous Month Sales
        prev_shift = np.random.normal(1.0, 0.12)
        prev_month_sales.append(round(val * max(0.5, prev_shift), 2))
        
        # Forecasted Sales (simulate a model error. Q4 sales have slightly larger error)
        if d.month in [11, 12]:
            error_margin = np.random.normal(0.04, 0.08) # slight under-forecasting bias in holiday rush
        else:
            error_margin = np.random.normal(0.01, 0.06) # standard variation
            
        fc = val * (1 + error_margin)
        forecasted_sales.append(round(max(1.0, fc), 2))
        
    prev_month_sales = np.array(prev_month_sales)
    forecasted_sales = np.array(forecasted_sales)
    
    # Forecast Error % = abs(Actual - Forecast) / Actual * 100
    forecast_error_pct = np.round(np.abs(sales_amount - forecasted_sales) / sales_amount * 100, 2)
    # Handle any zero actual sales division edge cases
    forecast_error_pct = np.nan_to_num(forecast_error_pct, nan=0.0, posinf=100.0)

    # Introduce some deliberate raw data impurities for cleaning
    # 1. Standard missing values in Marketing Spend (about 1%)
    # 2. Outliers in Sales Amount / Units Sold (extremely large values, about 0.05%)
    # 3. Non-standardized product categories (e.g., 'electrncs' instead of 'Electronics', 'fashion_wear' instead of 'Fashion')
    print("Introducing realistic raw data anomalies for data cleaning practice...")
    marketing_spend = [np.nan if np.random.rand() < 0.01 else m for m in marketing_spend]
    
    # Non-standardized categories (about 0.5% occurrences)
    category_mapping_dirty = []
    for cat in chosen_categories:
        rand = np.random.rand()
        if rand < 0.002:
            category_mapping_dirty.append(cat.lower()[:5])  # e.g., 'elect', 'fashi'
        elif rand < 0.005:
            category_mapping_dirty.append(cat + " ")  # Trailing whitespace
        else:
            category_mapping_dirty.append(cat)
            
    # Assemble into DataFrame
    df = pd.DataFrame({
        'Order ID': order_ids,
        'Order Date': formatted_dates,
        'Month': months,
        'Quarter': quarters,
        'Year': years,
        'Region': chosen_regions,
        'City': chosen_cities,
        'Product Category': category_mapping_dirty,
        'Product Name': chosen_products,
        'Units Sold': units_sold,
        'Unit Price': unit_prices,
        'Sales Amount': sales_amount,
        'Discount %': np.round(discounts * 100, 2),
        'Marketing Spend': marketing_spend,
        'Stock Available': stock_available,
        'Demand Level': demand_levels,
        'Previous Month Sales': prev_month_sales,
        'Forecasted Sales': forecasted_sales,
        'Actual Sales': sales_amount, # Actual sales is the final transaction amount
        'Forecast Error %': forecast_error_pct,
        'Season': seasons
    })

    # Save to data directory
    os.makedirs('data', exist_ok=True)
    df.to_csv('data/sales_data.csv', index=False)
    print(f"Data generation complete! Saved {df.shape[0]} unique rows to 'data/sales_data.csv'.")

if __name__ == "__main__":
    main()
