# F6 Customers and Delivery Locations

The frontend follows backend B5 exactly: Customers are Merchant-scoped records with optional names, canonical Uganda phones, and ACTIVE/ARCHIVED status. Customer phone is unique per Merchant and remains reserved while archived.

Delivery Locations are nested under one Customer. Area, landmark, and an independent delivery phone are required; instructions and an HTTP(S) map-pin URL are optional. Location phones are not unique. Both lifecycles use PATCH and retain history.

There is no default location, postal-address abstraction, delivery zone, fee, rider, Order, Inventory, or DeliveryJob integration. `customers.read` controls navigation and all reading. `customers.manage` controls writes and never implies read.
