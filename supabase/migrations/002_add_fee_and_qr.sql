-- LINE QRコード URL
ALTER TABLE company_profiles ADD COLUMN line_qr_url TEXT;

-- 手数料負担割合（0-100%）
ALTER TABLE company_profiles ADD COLUMN fee_ratio_landlord INTEGER
  CHECK (fee_ratio_landlord >= 0 AND fee_ratio_landlord <= 100);
ALTER TABLE company_profiles ADD COLUMN fee_ratio_tenant INTEGER
  CHECK (fee_ratio_tenant >= 0 AND fee_ratio_tenant <= 100);

-- 手数料配分（0-100%）
ALTER TABLE company_profiles ADD COLUMN fee_distribution_motoduke INTEGER
  CHECK (fee_distribution_motoduke >= 0 AND fee_distribution_motoduke <= 100);
ALTER TABLE company_profiles ADD COLUMN fee_distribution_kyakuzuke INTEGER
  CHECK (fee_distribution_kyakuzuke >= 0 AND fee_distribution_kyakuzuke <= 100);
