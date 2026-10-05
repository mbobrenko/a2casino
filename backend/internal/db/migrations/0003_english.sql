-- v0.2.1: the player site is in English. Translate the seeded texts (only rows still holding the original Russian seed).

UPDATE games SET description='Provably fair: guess whether the roll lands below your target.'
  WHERE slug='dice' AND description LIKE 'Доказуемо честная%';

UPDATE vip_levels SET perks = CASE level
  WHEN 1 THEN 'Welcome bonus'
  WHEN 2 THEN '5% cashback, rakeback'
  WHEN 3 THEN '8% cashback, faster withdrawals'
  WHEN 4 THEN '10% cashback, personal manager'
  WHEN 5 THEN '15% cashback, exclusive bonuses' END
  WHERE perks IN ('Приветственный бонус','Кэшбэк 5%, рейкбэк','Кэшбэк 8%, ускоренный вывод','Кэшбэк 10%, персональный менеджер','Кэшбэк 15%, эксклюзивные бонусы');

UPDATE bonuses SET title='100% Welcome Bonus', description='100% on your first deposit up to $500, x35 wagering' WHERE title='Приветственный бонус 100%';
UPDATE bonuses SET title='$5 No-Deposit Bonus', description='$5 bonus money with a promo code, x40 wagering' WHERE title='Бонус без депозита $5';
UPDATE bonuses SET title='50 Free Spins on Book of Sands', description='50 spins at $0.20, winnings with x30 wagering' WHERE title='50 фриспинов в Book of Sands';
UPDATE bonuses SET title='50% Reload Bonus', description='50% on a deposit up to $200, x30 wagering' WHERE title='Релоад 50%';

UPDATE banners SET title='100% First Deposit Bonus', subtitle='Up to $500 on your first deposit', cta_text='Claim now' WHERE title='100% на первый депозит';
UPDATE banners SET title='50 Free Spins', subtitle='Use code SPINS50 on the Promotions page', cta_text='Activate' WHERE title='50 фриспинов';
UPDATE banners SET title='A2 VIP Club', subtitle='Up to 15% cashback and rakeback on every bet', cta_text='Learn more' WHERE title='VIP-клуб A2';
