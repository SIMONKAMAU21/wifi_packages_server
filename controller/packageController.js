import Package from "../models/Package.js";

// @desc    Get all wifi packages
// @route   GET /api/packages
// @access  Public
export const getPackages = async (req, res) => {
  try {
    const packages = await Package.find({}).sort({ price: 1 });
    res.json(packages);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch packages", error: error.message });
  }
};

// @desc    Get single package
// @route   GET /api/packages/:id
// @access  Public
export const getPackageById = async (req, res) => {
  try {
    const pkg = await Package.findById(req.params.id);
    if (!pkg) {
      return res.status(404).json({ message: "Package not found" });
    }
    res.json(pkg);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch package", error: error.message });
  }
};

// @desc    Create new package
// @route   POST /api/packages
// @access  Private/Admin
export const createPackage = async (req, res) => {
  try {
    const { name, price, durationMinutes, bandwidthLimitMbps, dataLimitMB, description } = req.body;

    if (!name || price === undefined || !durationMinutes) {
      return res.status(400).json({ message: "Please provide name, price, and durationMinutes" });
    }

    const packageExists = await Package.findOne({ name });
    if (packageExists) {
      return res.status(400).json({ message: "Package with this name already exists" });
    }

    const pkg = await Package.create({
      name,
      price,
      durationMinutes,
      bandwidthLimitMbps: bandwidthLimitMbps || 0,
      dataLimitMB: dataLimitMB || 0,
      description: description || "",
    });

    res.status(201).json(pkg);
  } catch (error) {
    res.status(500).json({ message: "Failed to create package", error: error.message });
  }
};

// @desc    Update package
// @route   PUT /api/packages/:id
// @access  Private/Admin
export const updatePackage = async (req, res) => {
  try {
    const { name, price, durationMinutes, bandwidthLimitMbps, dataLimitMB, description } = req.body;

    const pkg = await Package.findById(req.params.id);
    if (!pkg) {
      return res.status(404).json({ message: "Package not found" });
    }

    pkg.name = name || pkg.name;
    pkg.price = price !== undefined ? price : pkg.price;
    pkg.durationMinutes = durationMinutes || pkg.durationMinutes;
    pkg.bandwidthLimitMbps = bandwidthLimitMbps !== undefined ? bandwidthLimitMbps : pkg.bandwidthLimitMbps;
    pkg.dataLimitMB = dataLimitMB !== undefined ? dataLimitMB : pkg.dataLimitMB;
    pkg.description = description !== undefined ? description : pkg.description;

    const updatedPkg = await pkg.save();
    res.json(updatedPkg);
  } catch (error) {
    res.status(500).json({ message: "Failed to update package", error: error.message });
  }
};

// @desc    Delete package
// @route   DELETE /api/packages/:id
// @access  Private/Admin
export const deletePackage = async (req, res) => {
  try {
    const pkg = await Package.findById(req.params.id);
    if (!pkg) {
      return res.status(404).json({ message: "Package not found" });
    }

    await Package.findByIdAndDelete(req.params.id);
    res.json({ message: "Package deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: "Failed to delete package", error: error.message });
  }
};
