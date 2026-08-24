const Order = require('../models/Order');
const MenuItem = require('../models/MenuItem');

// @desc    Create new order
// @route   POST /api/orders
// @access  Private
exports.createOrder = async (req, res) => {
  try {
    const { orderItems } = req.body;

    if (!orderItems || orderItems.length === 0) {
      return res.status(400).json({ message: 'No order items' });
    }

    // Verify items, calculate total amount securely on backend
    let calculatedTotal = 0;
    const validatedItems = [];

    for (const item of orderItems) {
      if (!item.menuItem || !item.qty || item.qty < 1) {
        return res.status(400).json({ message: 'Invalid item data (missing ID or invalid quantity)' });
      }

      const dbMenuItem = await MenuItem.findById(item.menuItem);

      if (!dbMenuItem) {
        return res.status(404).json({ message: `Menu item not found: ${item.menuItem}` });
      }

      if (!dbMenuItem.isAvailable) {
        return res.status(400).json({ message: `Menu item is not available: ${dbMenuItem.name}` });
      }

      // Add to validated list, using actual DB price and name to prevent tampering
      validatedItems.push({
        name: dbMenuItem.name,
        qty: item.qty,
        price: dbMenuItem.price,
        menuItem: dbMenuItem._id
      });

      calculatedTotal += dbMenuItem.price * item.qty;
    }

    const order = await Order.create({
      user: req.user._id,
      orderItems: validatedItems,
      totalAmount: Number(calculatedTotal.toFixed(2))
    });

    res.status(201).json(order);
  } catch (error) {
    if (error.kind === 'ObjectId') {
      return res.status(400).json({ message: 'Invalid menu item ID format' });
    }
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get logged in user's orders
// @route   GET /api/orders/myorders
// @access  Private
exports.getMyOrders = async (req, res) => {
  try {
    const orders = await Order.find({ user: req.user._id }).sort({ createdAt: -1 });
    res.json(orders);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get order by ID
// @route   GET /api/orders/:id
// @access  Private
exports.getOrderById = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id).populate('user', 'name email');

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    // Ensure customer can only view their own order
    if (order.user._id.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized to view this order' });
    }

    res.json(order);
  } catch (error) {
    if (error.kind === 'ObjectId') {
      return res.status(400).json({ message: 'Invalid order ID' });
    }
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get all orders
// @route   GET /api/orders
// @access  Private/Admin
exports.getOrders = async (req, res) => {
  try {
    const orders = await Order.find({}).populate('user', 'id name email').sort({ createdAt: -1 });
    res.json(orders);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Update order status
// @route   PUT /api/orders/:id/status
// @access  Private/Admin
exports.updateOrderStatus = async (req, res) => {
  try {
    const { status } = req.body;

    const validStatuses = ['Pending', 'Preparing', 'Ready', 'Completed', 'Cancelled'];
    
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({ message: 'Invalid status provided' });
    }

    const order = await Order.findById(req.params.id);

    if (order) {
      order.status = status;
      const updatedOrder = await order.save();
      res.json(updatedOrder);
    } else {
      res.status(404).json({ message: 'Order not found' });
    }
  } catch (error) {
    if (error.kind === 'ObjectId') {
      return res.status(400).json({ message: 'Invalid order ID' });
    }
    res.status(500).json({ message: error.message });
  }
};
