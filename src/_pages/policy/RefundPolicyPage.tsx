import React from "react";
import { useTranslation } from "react-i18next";

const RefundPolicyPage: React.FC = () => {
  const { t } = useTranslation();

  return (
    <main className="refund-policy-page">
      <h1>{t('refundPolicy.title')}</h1>

      <section>
        <h2>{t('refundPolicy.sections.productType.title')}</h2>
        <p>
          {t('refundPolicy.sections.productType.description')}
        </p>
      </section>

      <section>
        <h2>{t('refundPolicy.sections.deliveryMethod.title')}</h2>
        <p>
          {t('refundPolicy.sections.deliveryMethod.description1')}
          <strong> {t('refundPolicy.sections.deliveryMethod.description2')}</strong>
          {t('refundPolicy.sections.deliveryMethod.description3')}
        </p>
      </section>

      <section>
        <h2>{t('refundPolicy.sections.refundPolicy.title')}</h2>
        <p>
          {t('refundPolicy.sections.refundPolicy.description')}
        </p>
        <p>{t('refundPolicy.sections.refundPolicy.exceptionNote')}</p>
        <ul>
          <li>{t('refundPolicy.sections.refundPolicy.exceptions.exception1')}</li>
          <li>{t('refundPolicy.sections.refundPolicy.exceptions.exception2')}</li>
          <li>{t('refundPolicy.sections.refundPolicy.exceptions.exception3')}</li>
        </ul>
      </section>

      <section>
        <h2>{t('refundPolicy.sections.customerProtection.title')}</h2>
        <p>{t('refundPolicy.sections.customerProtection.description')}</p>
        <ul>
          <li>{t('refundPolicy.sections.customerProtection.protections.protection1')}</li>
          <li>{t('refundPolicy.sections.customerProtection.protections.protection2')}</li>
          <li>{t('refundPolicy.sections.customerProtection.protections.protection3')}</li>
        </ul>
        <p>
          {t('refundPolicy.sections.customerProtection.contact')}{" "}
          <a href="mailto:support@copydrum.com">{t('refundPolicy.sections.customerProtection.email')}</a>
        </p>
      </section>
    </main>
  );
};

export default RefundPolicyPage;
