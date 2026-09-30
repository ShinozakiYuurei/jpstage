import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  getAllPaymentMethods,
  getVerifiedPaymentVendors,
  isPaymentVerified,
  paymentMethodsOf,
  PAYMENT_LABEL,
  type PaymentMethod,
} from '../lib/ticket-payments.ts';

/**
 * 售票平台支付方式表的数据校验
 *
 * ★ 为什么这些断言值得写：
 *   支付方式表是**手写**的（平台政策变动频率远低于抓取资料），
 *   手写表最容易出的错是「改了 A 忘了 B」——
 *   例如给某个平台加了卡种，却忘了在 PAYMENT_LABEL 里加显示名，
 *   结果筛选器里出现一个没有标签的幽灵选项。
 *   这些断言正是把「两个面必须一致」这件事钉死。
 */

test('Lawson 是唯一支持 PayPal 的日本售票平台', () => {
  const info = paymentMethodsOf('lawson');
  assert.equal(info.verified, true);
  assert.ok(info.methods.includes('paypal'));
  assert.match(info.note, /PayPal/);
  assert.equal(info.source, 'https://l-tike.com/guide/payment/');

  const withPaypal = getVerifiedPaymentVendors().filter((v) => v.methods.includes('paypal'));
  assert.deepEqual(withPaypal.map((v) => v.vendor), ['lawson']);
});

test('每家已核实的平台都有一致的卡种与出處', () => {
  const expected: Record<string, PaymentMethod[]> = {
    lawson: ['visa', 'jcb', 'mastercard', 'diners_club', 'american_express', 'paypal', 'paypay', 'rakuten_pay', 'carrier', 'chocom', 'pay_easy', 'convenience_store', 'postal_transfer'],
    pia: ['visa', 'mastercard', 'jcb', 'american_express', 'diners_club', 'nicos', 'aeon', 'pia_card', 'convenience_store', 'pay_easy', 'net_banking', 'atm'],
    eplus: ['visa', 'mastercard', 'jcb', 'american_express', 'diners_club', 'saizon', 'uc', 'dc', 'convenience_store', 'atm', 'net_banking'],
    cn: ['visa', 'mastercard', 'jcb', 'diners_club', 'american_express', 'convenience_store'],
    seven: ['jcb', 'visa', 'mastercard', 'american_express', 'diners_club', 'nanaco', 'cash'],
    livepocket: ['visa', 'mastercard', 'jcb', 'convenience_store', 'atone'],
    gingeki: ['visa', 'mastercard', 'nicos', 'ufj'],
    etix: ['credit_card', 'd_barai', 'convenience_store'],
    fany: ['credit_card', 'convenience_store'],
  };
  const verified = new Set(getVerifiedPaymentVendors().map((v) => v.vendor));
  const allMethods = getAllPaymentMethods();

  for (const [vendor, methods] of Object.entries(expected)) {
    const info = paymentMethodsOf(vendor);
    assert.equal(info.verified, true, vendor + ' should be verified');
    assert.equal(isPaymentVerified(vendor), true, vendor);
    assert.deepEqual(info.methods, methods, vendor + ' methods drifted');
    assert.ok(info.source && info.source.startsWith('https://'), vendor + ' needs an official source URL');
    assert.ok(verified.has(vendor), vendor + ' should appear in the filter list');
    for (const m of methods) {
      assert.ok(allMethods.includes(m), vendor + ' ' + m + ' should be a filter option');
      assert.ok(PAYMENT_LABEL[m], m + ' needs a readable label');
    }
  }
});

test('未核实的平台不列出具体支付方式，也不进筛选器', () => {
  for (const vendor of ['toho', 'rakuten', 'tbs', 'shochiku', 'asoview', 'hikosen']) {
    const info = paymentMethodsOf(vendor);
    assert.equal(info.verified, false, vendor + ' must stay unverified until official evidence is found');
    assert.deepEqual(info.methods, [], vendor + ' must not list methods while unverified');
    assert.equal(info.source, null, vendor + ' must not cite a source it does not have');
    assert.equal(isPaymentVerified(vendor), false, vendor);
  }
  const verified = getVerifiedPaymentVendors().map((v) => v.vendor);
  for (const vendor of ['toho', 'rakuten', 'tbs', 'shochiku', 'asoview', 'hikosen']) {
    assert.ok(!verified.includes(vendor), vendor + ' must not appear in the filter list');
  }
});

test('未知平台不继承任何已确认的支付方式', () => {
  const info = paymentMethodsOf('does-not-exist');
  assert.equal(info.verified, false);
  assert.deepEqual(info.methods, []);
  assert.equal(info.source, null);
  assert.equal(isPaymentVerified('does-not-exist'), false);
});

test('支付宝与微信支付不出现在任何已核实平台的支付方式里', () => {
  // 日本主流售票平台的官方说明中确实没有这两项 —— 这是事实，不是抓取遗漏。
  // 若未来某家开通，本测试会失败，提醒更新表与这段说明。
  for (const { vendor, methods } of getVerifiedPaymentVendors()) {
    for (const m of methods) {
      assert.ok(
        !/alipay|wechat/i.test(m),
        vendor + ' unexpectedly lists ' + m + ' — update the module doc comment if this is real',
      );
    }
  }
  assert.equal(PAYMENT_LABEL.credit_card.zh, '信用卡');
  assert.equal(PAYMENT_LABEL.paypal.zh, 'PayPal');
});

