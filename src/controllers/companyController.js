const Company = require("../models/Company");

const createCompany = async (req, res, next) => {
  try {
    const { name, slug, website, logo, industry, size, about, locations } =
      req.body;

    if (!name || !slug) {
      return res.status(400).json({
        message: "Name and Slug are required",
      });
    }

    const existingCompany = await Company.findOne({ slug });

    if (existingCompany) {
      return res.status("409").json({
        message: "Company with this name is alredy exists",
      });
    }

    const company = await Company.create({
      name,
      slug,
      website,
      logo,
      industry,
      size,
      about,
      locations,
      owner: req.user.userId,
    });

    return res.status(201).json({
      message: "Company created successfully",
      company,
    });
  } catch (error) {
    next(error);
  }
};

const getMyCompany = async (req, res, next) => {
  try {
    const company = await Company.findOne({
      owner: req.user.userId,
    }).populate("owner", "name email");

    if (!company) {
      return res.status(400).json({
        message: "Company Not Found",
      });
    }
    return res.status(200).json({
      message: "Company fetched Sucessfully",
      company,
    });
  } catch (error) {
    next(error);
  }
};

const getCompanyById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const company = await Company.findById(id)
      .populate("owner", "name email")
      .populate("verifiedBy", "name email");

    if (!company) {
      return res.status(404).json({
        message: "Comany Not Found",
      });
    }

    return res.status(200).json({
      message: "Compant data Fetched Successfully",
      company,
    });
  } catch (error) {
    next(error);
  }
};

const getAllCompany = async (req, res, next) => {
  try {
    const companies = (
      await Company.find().populate("owner", "name email")
    ).sort({ createdAt: -1 });

    return res.status(200).json({
      message: "Companies fetched Successfully",
      companies,
    });
  } catch (error) {
    next(error);
  }
};

const updateCompany = async (req, res, next) => {
  try {
    const { id } = req.params;

    const { name, slug, website, logo, industry, size, about, locations } =
      req.body;

    const company = await Company.findById(id);

    if (!company) {
      return res.status(404).json({
        message: "Company not found",
      });
    }

    // Only owner can update company
    if (company.owner.toString() !== req.user.userId) {
      return res.status(403).json({
        message: "You are not authorized to update this company",
      });
    }

    // Check slug if changed
    if (slug !== undefined && slug !== company.slug) {
      const existingCompany = await Company.findOne({
        slug,
        _id: { $ne: id },
      });

      if (existingCompany) {
        return res.status(409).json({
          message: "Company with this slug already exists",
        });
      }

      company.slug = slug;
    }

    if (name !== undefined) company.name = name;
    if (website !== undefined) company.website = website;
    if (logo !== undefined) company.logo = logo;
    if (industry !== undefined) company.industry = industry;
    if (size !== undefined) company.size = size;
    if (about !== undefined) company.about = about;
    if (locations !== undefined) company.locations = locations;

    await company.save();

    return res.status(200).json({
      message: "Company updated successfully",
      company,
    });
  } catch (error) {
    next(error);
  }
};

const verifyCompany = async (req, res, next) => {
  try {
    const { id } = req.params;

    const company = await Company.findById(id);

    if (!company) {
      return res.status(404).json({
        message: "Company not found",
      });
    }

    company.verified = true;
    company.verifiedAt = new Date();
    company.verifiedBy = req.user.userId;

    await company.save();

    return res.status(200).json({
      message: "Company verified successfully",
      company,
    });
  } catch (error) {
    next(error);
  }
};

const deleteCompany = async (req, res, next) => {
  try {
    const { id } = req.params;
    const company = await Company.findById(id);
    if (!company) {
      return res.status(404).json({
        message: "Company not found",
      });
    }
    if (company.owner.toString() !== req.user.userId) {
      return res.status(403).json({
        message: "You are not authorized to delete this company",
      });
    }

    await Company.findByIdAndUpdate(id);
    return res.status(200).json({
      message: "Company delete Succesfully",
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createCompany,
  getMyCompany,
  getCompanyById,
  getAllCompany,
  updateCompany,
  verifyCompany,
  deleteCompany,
};
