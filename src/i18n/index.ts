import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import messages from './local/index';
import { supportedLanguages, defaultLanguage } from './languages';
import { getLocaleFromHost } from './getLocaleFromHost';
import { getLanguageFromPath } from './languages';

// JSON 번역 파일 명시적 임포트 (import.meta.glob 대체)
import koAuthCallback from './locales/ko/authCallback.json';
import koAuthForgotPassword from './locales/ko/authForgotPassword.json';
import koAuthLogin from './locales/ko/authLogin.json';
import koAuthRegister from './locales/ko/authRegister.json';
import koAuthResetPassword from './locales/ko/authResetPassword.json';
import koCartPage from './locales/ko/cartPage.json';
import koCategoriesPage from './locales/ko/categoriesPage.json';
import koCollectionsDetail from './locales/ko/collectionsDetail.json';
import koCollectionsPage from './locales/ko/collectionsPage.json';
import koCompanyAbout from './locales/ko/companyAbout.json';
import koCompanyPartnership from './locales/ko/companyPartnership.json';
import koCustomerSupport from './locales/ko/customerSupport.json';
import koCustomOrder from './locales/ko/customOrder.json';
import koCustomOrderDetail from './locales/ko/customOrderDetail.json';
import koCustomOrders from './locales/ko/customOrders.json';
import koEventSale from './locales/ko/eventSale.json';
import koFreeSheets from './locales/ko/freeSheets.json';
import koGuidePage from './locales/ko/guidePage.json';
import koHome from './locales/ko/home.json';
import koMyOrders from './locales/ko/myOrders.json';
import koMypage from './locales/ko/mypage.json';
import koNotFound from './locales/ko/notFound.json';
import koRefundPolicy from './locales/ko/refundPolicy.json';
import koSeo from './locales/ko/seo.json';
import koSheetDetail from './locales/ko/sheetDetail.json';
import koSidebar from './locales/ko/sidebar.json';
import koCheckout from './locales/ko/checkout.json';
import koPaymentSuccess from './locales/ko/paymentSuccess.json';

import enAuthCallback from './locales/en/authCallback.json';
import enAuthForgotPassword from './locales/en/authForgotPassword.json';
import enAuthLogin from './locales/en/authLogin.json';
import enAuthRegister from './locales/en/authRegister.json';
import enAuthResetPassword from './locales/en/authResetPassword.json';
import enCartPage from './locales/en/cartPage.json';
import enCategoriesPage from './locales/en/categoriesPage.json';
import enCollectionsDetail from './locales/en/collectionsDetail.json';
import enCollectionsPage from './locales/en/collectionsPage.json';
import enCompanyAbout from './locales/en/companyAbout.json';
import enCompanyPartnership from './locales/en/companyPartnership.json';
import enCustomerSupport from './locales/en/customerSupport.json';
import enCustomOrder from './locales/en/customOrder.json';
import enCustomOrderDetail from './locales/en/customOrderDetail.json';
import enCustomOrders from './locales/en/customOrders.json';
import enEventSale from './locales/en/eventSale.json';
import enFreeSheets from './locales/en/freeSheets.json';
import enGuidePage from './locales/en/guidePage.json';
import enHome from './locales/en/home.json';
import enMyOrders from './locales/en/myOrders.json';
import enMypage from './locales/en/mypage.json';
import enNotFound from './locales/en/notFound.json';
import enRefundPolicy from './locales/en/refundPolicy.json';
import enSeo from './locales/en/seo.json';
import enSheetDetail from './locales/en/sheetDetail.json';
import enSidebar from './locales/en/sidebar.json';
import enCheckout from './locales/en/checkout.json';
import enPaymentSuccess from './locales/en/paymentSuccess.json';

import jaAuthCallback from './locales/ja/authCallback.json';
import jaAuthForgotPassword from './locales/ja/authForgotPassword.json';
import jaAuthLogin from './locales/ja/authLogin.json';
import jaAuthRegister from './locales/ja/authRegister.json';
import jaAuthResetPassword from './locales/ja/authResetPassword.json';
import jaCartPage from './locales/ja/cartPage.json';
import jaCategoriesPage from './locales/ja/categoriesPage.json';
import jaCollectionsDetail from './locales/ja/collectionsDetail.json';
import jaCollectionsPage from './locales/ja/collectionsPage.json';
import jaCompanyAbout from './locales/ja/companyAbout.json';
import jaCompanyPartnership from './locales/ja/companyPartnership.json';
import jaCustomerSupport from './locales/ja/customerSupport.json';
import jaCustomOrder from './locales/ja/customOrder.json';
import jaCustomOrderDetail from './locales/ja/customOrderDetail.json';
import jaCustomOrders from './locales/ja/customOrders.json';
import jaEventSale from './locales/ja/eventSale.json';
import jaFreeSheets from './locales/ja/freeSheets.json';
import jaGuidePage from './locales/ja/guidePage.json';
import jaHome from './locales/ja/home.json';
import jaMyOrders from './locales/ja/myOrders.json';
import jaMypage from './locales/ja/mypage.json';
import jaNotFound from './locales/ja/notFound.json';
import jaRefundPolicy from './locales/ja/refundPolicy.json';
import jaSeo from './locales/ja/seo.json';
import jaSheetDetail from './locales/ja/sheetDetail.json';
import jaSidebar from './locales/ja/sidebar.json';
import jaCheckout from './locales/ja/checkout.json';
import jaPaymentSuccess from './locales/ja/paymentSuccess.json';

import deAuthCallback from './locales/de/authCallback.json';
import deAuthForgotPassword from './locales/de/authForgotPassword.json';
import deAuthLogin from './locales/de/authLogin.json';
import deAuthRegister from './locales/de/authRegister.json';
import deAuthResetPassword from './locales/de/authResetPassword.json';
import deCartPage from './locales/de/cartPage.json';
import deCategoriesPage from './locales/de/categoriesPage.json';
import deCollectionsDetail from './locales/de/collectionsDetail.json';
import deCollectionsPage from './locales/de/collectionsPage.json';
import deCompanyAbout from './locales/de/companyAbout.json';
import deCompanyPartnership from './locales/de/companyPartnership.json';
import deCustomerSupport from './locales/de/customerSupport.json';
import deCustomOrder from './locales/de/customOrder.json';
import deCustomOrderDetail from './locales/de/customOrderDetail.json';
import deCustomOrders from './locales/de/customOrders.json';
import deEventSale from './locales/de/eventSale.json';
import deFreeSheets from './locales/de/freeSheets.json';
import deGuidePage from './locales/de/guidePage.json';
import deHome from './locales/de/home.json';
import deMyOrders from './locales/de/myOrders.json';
import deMypage from './locales/de/mypage.json';
import deNotFound from './locales/de/notFound.json';
import deRefundPolicy from './locales/de/refundPolicy.json';
import deSeo from './locales/de/seo.json';
import deSheetDetail from './locales/de/sheetDetail.json';
import deSidebar from './locales/de/sidebar.json';
import deCheckout from './locales/de/checkout.json';
import dePaymentSuccess from './locales/de/paymentSuccess.json';

import esAuthCallback from './locales/es/authCallback.json';
import esAuthForgotPassword from './locales/es/authForgotPassword.json';
import esAuthLogin from './locales/es/authLogin.json';
import esAuthRegister from './locales/es/authRegister.json';
import esAuthResetPassword from './locales/es/authResetPassword.json';
import esCartPage from './locales/es/cartPage.json';
import esCategoriesPage from './locales/es/categoriesPage.json';
import esCollectionsDetail from './locales/es/collectionsDetail.json';
import esCollectionsPage from './locales/es/collectionsPage.json';
import esCompanyAbout from './locales/es/companyAbout.json';
import esCompanyPartnership from './locales/es/companyPartnership.json';
import esCustomerSupport from './locales/es/customerSupport.json';
import esCustomOrder from './locales/es/customOrder.json';
import esCustomOrderDetail from './locales/es/customOrderDetail.json';
import esCustomOrders from './locales/es/customOrders.json';
import esEventSale from './locales/es/eventSale.json';
import esFreeSheets from './locales/es/freeSheets.json';
import esGuidePage from './locales/es/guidePage.json';
import esHome from './locales/es/home.json';
import esMyOrders from './locales/es/myOrders.json';
import esMypage from './locales/es/mypage.json';
import esNotFound from './locales/es/notFound.json';
import esRefundPolicy from './locales/es/refundPolicy.json';
import esSeo from './locales/es/seo.json';
import esSheetDetail from './locales/es/sheetDetail.json';
import esSidebar from './locales/es/sidebar.json';
import esCheckout from './locales/es/checkout.json';
import esPaymentSuccess from './locales/es/paymentSuccess.json';

import frAuthCallback from './locales/fr/authCallback.json';
import frAuthForgotPassword from './locales/fr/authForgotPassword.json';
import frAuthLogin from './locales/fr/authLogin.json';
import frAuthRegister from './locales/fr/authRegister.json';
import frAuthResetPassword from './locales/fr/authResetPassword.json';
import frCartPage from './locales/fr/cartPage.json';
import frCategoriesPage from './locales/fr/categoriesPage.json';
import frCollectionsDetail from './locales/fr/collectionsDetail.json';
import frCollectionsPage from './locales/fr/collectionsPage.json';
import frCompanyAbout from './locales/fr/companyAbout.json';
import frCompanyPartnership from './locales/fr/companyPartnership.json';
import frCustomerSupport from './locales/fr/customerSupport.json';
import frCustomOrder from './locales/fr/customOrder.json';
import frCustomOrderDetail from './locales/fr/customOrderDetail.json';
import frCustomOrders from './locales/fr/customOrders.json';
import frEventSale from './locales/fr/eventSale.json';
import frFreeSheets from './locales/fr/freeSheets.json';
import frGuidePage from './locales/fr/guidePage.json';
import frHome from './locales/fr/home.json';
import frMyOrders from './locales/fr/myOrders.json';
import frMypage from './locales/fr/mypage.json';
import frNotFound from './locales/fr/notFound.json';
import frRefundPolicy from './locales/fr/refundPolicy.json';
import frSeo from './locales/fr/seo.json';
import frSheetDetail from './locales/fr/sheetDetail.json';
import frSidebar from './locales/fr/sidebar.json';
import frCheckout from './locales/fr/checkout.json';
import frPaymentSuccess from './locales/fr/paymentSuccess.json';

import hiAuthCallback from './locales/hi/authCallback.json';
import hiAuthForgotPassword from './locales/hi/authForgotPassword.json';
import hiAuthLogin from './locales/hi/authLogin.json';
import hiAuthRegister from './locales/hi/authRegister.json';
import hiAuthResetPassword from './locales/hi/authResetPassword.json';
import hiCartPage from './locales/hi/cartPage.json';
import hiCategoriesPage from './locales/hi/categoriesPage.json';
import hiCollectionsDetail from './locales/hi/collectionsDetail.json';
import hiCollectionsPage from './locales/hi/collectionsPage.json';
import hiCompanyAbout from './locales/hi/companyAbout.json';
import hiCompanyPartnership from './locales/hi/companyPartnership.json';
import hiCustomerSupport from './locales/hi/customerSupport.json';
import hiCustomOrder from './locales/hi/customOrder.json';
import hiCustomOrderDetail from './locales/hi/customOrderDetail.json';
import hiCustomOrders from './locales/hi/customOrders.json';
import hiEventSale from './locales/hi/eventSale.json';
import hiFreeSheets from './locales/hi/freeSheets.json';
import hiGuidePage from './locales/hi/guidePage.json';
import hiHome from './locales/hi/home.json';
import hiMyOrders from './locales/hi/myOrders.json';
import hiMypage from './locales/hi/mypage.json';
import hiNotFound from './locales/hi/notFound.json';
import hiRefundPolicy from './locales/hi/refundPolicy.json';
import hiSeo from './locales/hi/seo.json';
import hiSheetDetail from './locales/hi/sheetDetail.json';
import hiSidebar from './locales/hi/sidebar.json';
import hiCheckout from './locales/hi/checkout.json';
import hiPaymentSuccess from './locales/hi/paymentSuccess.json';

import idAuthCallback from './locales/id/authCallback.json';
import idAuthForgotPassword from './locales/id/authForgotPassword.json';
import idAuthLogin from './locales/id/authLogin.json';
import idAuthRegister from './locales/id/authRegister.json';
import idAuthResetPassword from './locales/id/authResetPassword.json';
import idCartPage from './locales/id/cartPage.json';
import idCategoriesPage from './locales/id/categoriesPage.json';
import idCollectionsDetail from './locales/id/collectionsDetail.json';
import idCollectionsPage from './locales/id/collectionsPage.json';
import idCompanyAbout from './locales/id/companyAbout.json';
import idCompanyPartnership from './locales/id/companyPartnership.json';
import idCustomerSupport from './locales/id/customerSupport.json';
import idCustomOrder from './locales/id/customOrder.json';
import idCustomOrderDetail from './locales/id/customOrderDetail.json';
import idCustomOrders from './locales/id/customOrders.json';
import idEventSale from './locales/id/eventSale.json';
import idFreeSheets from './locales/id/freeSheets.json';
import idGuidePage from './locales/id/guidePage.json';
import idHome from './locales/id/home.json';
import idMyOrders from './locales/id/myOrders.json';
import idMypage from './locales/id/mypage.json';
import idNotFound from './locales/id/notFound.json';
import idRefundPolicy from './locales/id/refundPolicy.json';
import idSeo from './locales/id/seo.json';
import idSheetDetail from './locales/id/sheetDetail.json';
import idSidebar from './locales/id/sidebar.json';
import idCheckout from './locales/id/checkout.json';
import idPaymentSuccess from './locales/id/paymentSuccess.json';

import itAuthCallback from './locales/it/authCallback.json';
import itAuthForgotPassword from './locales/it/authForgotPassword.json';
import itAuthLogin from './locales/it/authLogin.json';
import itAuthRegister from './locales/it/authRegister.json';
import itAuthResetPassword from './locales/it/authResetPassword.json';
import itCartPage from './locales/it/cartPage.json';
import itCategoriesPage from './locales/it/categoriesPage.json';
import itCollectionsDetail from './locales/it/collectionsDetail.json';
import itCollectionsPage from './locales/it/collectionsPage.json';
import itCompanyAbout from './locales/it/companyAbout.json';
import itCompanyPartnership from './locales/it/companyPartnership.json';
import itCustomerSupport from './locales/it/customerSupport.json';
import itCustomOrder from './locales/it/customOrder.json';
import itCustomOrderDetail from './locales/it/customOrderDetail.json';
import itCustomOrders from './locales/it/customOrders.json';
import itEventSale from './locales/it/eventSale.json';
import itFreeSheets from './locales/it/freeSheets.json';
import itGuidePage from './locales/it/guidePage.json';
import itHome from './locales/it/home.json';
import itMyOrders from './locales/it/myOrders.json';
import itMypage from './locales/it/mypage.json';
import itNotFound from './locales/it/notFound.json';
import itRefundPolicy from './locales/it/refundPolicy.json';
import itSeo from './locales/it/seo.json';
import itSheetDetail from './locales/it/sheetDetail.json';
import itSidebar from './locales/it/sidebar.json';
import itCheckout from './locales/it/checkout.json';
import itPaymentSuccess from './locales/it/paymentSuccess.json';

import ptAuthCallback from './locales/pt/authCallback.json';
import ptAuthForgotPassword from './locales/pt/authForgotPassword.json';
import ptAuthLogin from './locales/pt/authLogin.json';
import ptAuthRegister from './locales/pt/authRegister.json';
import ptAuthResetPassword from './locales/pt/authResetPassword.json';
import ptCartPage from './locales/pt/cartPage.json';
import ptCategoriesPage from './locales/pt/categoriesPage.json';
import ptCollectionsDetail from './locales/pt/collectionsDetail.json';
import ptCollectionsPage from './locales/pt/collectionsPage.json';
import ptCompanyAbout from './locales/pt/companyAbout.json';
import ptCompanyPartnership from './locales/pt/companyPartnership.json';
import ptCustomerSupport from './locales/pt/customerSupport.json';
import ptCustomOrder from './locales/pt/customOrder.json';
import ptCustomOrderDetail from './locales/pt/customOrderDetail.json';
import ptCustomOrders from './locales/pt/customOrders.json';
import ptEventSale from './locales/pt/eventSale.json';
import ptFreeSheets from './locales/pt/freeSheets.json';
import ptGuidePage from './locales/pt/guidePage.json';
import ptHome from './locales/pt/home.json';
import ptMyOrders from './locales/pt/myOrders.json';
import ptMypage from './locales/pt/mypage.json';
import ptNotFound from './locales/pt/notFound.json';
import ptRefundPolicy from './locales/pt/refundPolicy.json';
import ptSeo from './locales/pt/seo.json';
import ptSheetDetail from './locales/pt/sheetDetail.json';
import ptSidebar from './locales/pt/sidebar.json';
import ptCheckout from './locales/pt/checkout.json';
import ptPaymentSuccess from './locales/pt/paymentSuccess.json';

import ruAuthCallback from './locales/ru/authCallback.json';
import ruAuthForgotPassword from './locales/ru/authForgotPassword.json';
import ruAuthLogin from './locales/ru/authLogin.json';
import ruAuthRegister from './locales/ru/authRegister.json';
import ruAuthResetPassword from './locales/ru/authResetPassword.json';
import ruCartPage from './locales/ru/cartPage.json';
import ruCategoriesPage from './locales/ru/categoriesPage.json';
import ruCollectionsDetail from './locales/ru/collectionsDetail.json';
import ruCollectionsPage from './locales/ru/collectionsPage.json';
import ruCompanyAbout from './locales/ru/companyAbout.json';
import ruCompanyPartnership from './locales/ru/companyPartnership.json';
import ruCustomerSupport from './locales/ru/customerSupport.json';
import ruCustomOrder from './locales/ru/customOrder.json';
import ruCustomOrderDetail from './locales/ru/customOrderDetail.json';
import ruCustomOrders from './locales/ru/customOrders.json';
import ruEventSale from './locales/ru/eventSale.json';
import ruFreeSheets from './locales/ru/freeSheets.json';
import ruGuidePage from './locales/ru/guidePage.json';
import ruHome from './locales/ru/home.json';
import ruMyOrders from './locales/ru/myOrders.json';
import ruMypage from './locales/ru/mypage.json';
import ruNotFound from './locales/ru/notFound.json';
import ruRefundPolicy from './locales/ru/refundPolicy.json';
import ruSeo from './locales/ru/seo.json';
import ruSheetDetail from './locales/ru/sheetDetail.json';
import ruSidebar from './locales/ru/sidebar.json';
import ruCheckout from './locales/ru/checkout.json';
import ruPaymentSuccess from './locales/ru/paymentSuccess.json';

import thAuthCallback from './locales/th/authCallback.json';
import thAuthForgotPassword from './locales/th/authForgotPassword.json';
import thAuthLogin from './locales/th/authLogin.json';
import thAuthRegister from './locales/th/authRegister.json';
import thAuthResetPassword from './locales/th/authResetPassword.json';
import thCartPage from './locales/th/cartPage.json';
import thCategoriesPage from './locales/th/categoriesPage.json';
import thCollectionsDetail from './locales/th/collectionsDetail.json';
import thCollectionsPage from './locales/th/collectionsPage.json';
import thCompanyAbout from './locales/th/companyAbout.json';
import thCompanyPartnership from './locales/th/companyPartnership.json';
import thCustomerSupport from './locales/th/customerSupport.json';
import thCustomOrder from './locales/th/customOrder.json';
import thCustomOrderDetail from './locales/th/customOrderDetail.json';
import thCustomOrders from './locales/th/customOrders.json';
import thEventSale from './locales/th/eventSale.json';
import thFreeSheets from './locales/th/freeSheets.json';
import thGuidePage from './locales/th/guidePage.json';
import thHome from './locales/th/home.json';
import thMyOrders from './locales/th/myOrders.json';
import thMypage from './locales/th/mypage.json';
import thNotFound from './locales/th/notFound.json';
import thRefundPolicy from './locales/th/refundPolicy.json';
import thSeo from './locales/th/seo.json';
import thSheetDetail from './locales/th/sheetDetail.json';
import thSidebar from './locales/th/sidebar.json';
import thCheckout from './locales/th/checkout.json';
import thPaymentSuccess from './locales/th/paymentSuccess.json';

import trAuthCallback from './locales/tr/authCallback.json';
import trAuthForgotPassword from './locales/tr/authForgotPassword.json';
import trAuthLogin from './locales/tr/authLogin.json';
import trAuthRegister from './locales/tr/authRegister.json';
import trAuthResetPassword from './locales/tr/authResetPassword.json';
import trCartPage from './locales/tr/cartPage.json';
import trCategoriesPage from './locales/tr/categoriesPage.json';
import trCollectionsDetail from './locales/tr/collectionsDetail.json';
import trCollectionsPage from './locales/tr/collectionsPage.json';
import trCompanyAbout from './locales/tr/companyAbout.json';
import trCompanyPartnership from './locales/tr/companyPartnership.json';
import trCustomerSupport from './locales/tr/customerSupport.json';
import trCustomOrder from './locales/tr/customOrder.json';
import trCustomOrderDetail from './locales/tr/customOrderDetail.json';
import trCustomOrders from './locales/tr/customOrders.json';
import trEventSale from './locales/tr/eventSale.json';
import trFreeSheets from './locales/tr/freeSheets.json';
import trGuidePage from './locales/tr/guidePage.json';
import trHome from './locales/tr/home.json';
import trMyOrders from './locales/tr/myOrders.json';
import trMypage from './locales/tr/mypage.json';
import trNotFound from './locales/tr/notFound.json';
import trRefundPolicy from './locales/tr/refundPolicy.json';
import trSeo from './locales/tr/seo.json';
import trSheetDetail from './locales/tr/sheetDetail.json';
import trSidebar from './locales/tr/sidebar.json';
import trCheckout from './locales/tr/checkout.json';
import trPaymentSuccess from './locales/tr/paymentSuccess.json';

import ukAuthCallback from './locales/uk/authCallback.json';
import ukAuthForgotPassword from './locales/uk/authForgotPassword.json';
import ukAuthLogin from './locales/uk/authLogin.json';
import ukAuthRegister from './locales/uk/authRegister.json';
import ukAuthResetPassword from './locales/uk/authResetPassword.json';
import ukCartPage from './locales/uk/cartPage.json';
import ukCategoriesPage from './locales/uk/categoriesPage.json';
import ukCollectionsDetail from './locales/uk/collectionsDetail.json';
import ukCollectionsPage from './locales/uk/collectionsPage.json';
import ukCompanyAbout from './locales/uk/companyAbout.json';
import ukCompanyPartnership from './locales/uk/companyPartnership.json';
import ukCustomerSupport from './locales/uk/customerSupport.json';
import ukCustomOrder from './locales/uk/customOrder.json';
import ukCustomOrderDetail from './locales/uk/customOrderDetail.json';
import ukCustomOrders from './locales/uk/customOrders.json';
import ukEventSale from './locales/uk/eventSale.json';
import ukFreeSheets from './locales/uk/freeSheets.json';
import ukGuidePage from './locales/uk/guidePage.json';
import ukHome from './locales/uk/home.json';
import ukMyOrders from './locales/uk/myOrders.json';
import ukMypage from './locales/uk/mypage.json';
import ukNotFound from './locales/uk/notFound.json';
import ukRefundPolicy from './locales/uk/refundPolicy.json';
import ukSeo from './locales/uk/seo.json';
import ukSheetDetail from './locales/uk/sheetDetail.json';
import ukSidebar from './locales/uk/sidebar.json';
import ukCheckout from './locales/uk/checkout.json';
import ukPaymentSuccess from './locales/uk/paymentSuccess.json';

import viAuthCallback from './locales/vi/authCallback.json';
import viAuthForgotPassword from './locales/vi/authForgotPassword.json';
import viAuthLogin from './locales/vi/authLogin.json';
import viAuthRegister from './locales/vi/authRegister.json';
import viAuthResetPassword from './locales/vi/authResetPassword.json';
import viCartPage from './locales/vi/cartPage.json';
import viCategoriesPage from './locales/vi/categoriesPage.json';
import viCollectionsDetail from './locales/vi/collectionsDetail.json';
import viCollectionsPage from './locales/vi/collectionsPage.json';
import viCompanyAbout from './locales/vi/companyAbout.json';
import viCompanyPartnership from './locales/vi/companyPartnership.json';
import viCustomerSupport from './locales/vi/customerSupport.json';
import viCustomOrder from './locales/vi/customOrder.json';
import viCustomOrderDetail from './locales/vi/customOrderDetail.json';
import viCustomOrders from './locales/vi/customOrders.json';
import viEventSale from './locales/vi/eventSale.json';
import viFreeSheets from './locales/vi/freeSheets.json';
import viGuidePage from './locales/vi/guidePage.json';
import viHome from './locales/vi/home.json';
import viMyOrders from './locales/vi/myOrders.json';
import viMypage from './locales/vi/mypage.json';
import viNotFound from './locales/vi/notFound.json';
import viRefundPolicy from './locales/vi/refundPolicy.json';
import viSeo from './locales/vi/seo.json';
import viSheetDetail from './locales/vi/sheetDetail.json';
import viSidebar from './locales/vi/sidebar.json';
import viCheckout from './locales/vi/checkout.json';
import viPaymentSuccess from './locales/vi/paymentSuccess.json';

import zhCNAuthCallback from './locales/zh-CN/authCallback.json';
import zhCNAuthForgotPassword from './locales/zh-CN/authForgotPassword.json';
import zhCNAuthLogin from './locales/zh-CN/authLogin.json';
import zhCNAuthRegister from './locales/zh-CN/authRegister.json';
import zhCNAuthResetPassword from './locales/zh-CN/authResetPassword.json';
import zhCNCartPage from './locales/zh-CN/cartPage.json';
import zhCNCategoriesPage from './locales/zh-CN/categoriesPage.json';
import zhCNCollectionsDetail from './locales/zh-CN/collectionsDetail.json';
import zhCNCollectionsPage from './locales/zh-CN/collectionsPage.json';
import zhCNCompanyAbout from './locales/zh-CN/companyAbout.json';
import zhCNCompanyPartnership from './locales/zh-CN/companyPartnership.json';
import zhCNCustomerSupport from './locales/zh-CN/customerSupport.json';
import zhCNCustomOrder from './locales/zh-CN/customOrder.json';
import zhCNCustomOrderDetail from './locales/zh-CN/customOrderDetail.json';
import zhCNCustomOrders from './locales/zh-CN/customOrders.json';
import zhCNEventSale from './locales/zh-CN/eventSale.json';
import zhCNFreeSheets from './locales/zh-CN/freeSheets.json';
import zhCNGuidePage from './locales/zh-CN/guidePage.json';
import zhCNHome from './locales/zh-CN/home.json';
import zhCNMyOrders from './locales/zh-CN/myOrders.json';
import zhCNMypage from './locales/zh-CN/mypage.json';
import zhCNNotFound from './locales/zh-CN/notFound.json';
import zhCNRefundPolicy from './locales/zh-CN/refundPolicy.json';
import zhCNSeo from './locales/zh-CN/seo.json';
import zhCNSheetDetail from './locales/zh-CN/sheetDetail.json';
import zhCNSidebar from './locales/zh-CN/sidebar.json';
import zhCNCheckout from './locales/zh-CN/checkout.json';
import zhCNPaymentSuccess from './locales/zh-CN/paymentSuccess.json';

import zhTWAuthCallback from './locales/zh-TW/authCallback.json';
import zhTWAuthForgotPassword from './locales/zh-TW/authForgotPassword.json';
import zhTWAuthLogin from './locales/zh-TW/authLogin.json';
import zhTWAuthRegister from './locales/zh-TW/authRegister.json';
import zhTWAuthResetPassword from './locales/zh-TW/authResetPassword.json';
import zhTWCartPage from './locales/zh-TW/cartPage.json';
import zhTWCategoriesPage from './locales/zh-TW/categoriesPage.json';
import zhTWCollectionsDetail from './locales/zh-TW/collectionsDetail.json';
import zhTWCollectionsPage from './locales/zh-TW/collectionsPage.json';
import zhTWCompanyAbout from './locales/zh-TW/companyAbout.json';
import zhTWCompanyPartnership from './locales/zh-TW/companyPartnership.json';
import zhTWCustomerSupport from './locales/zh-TW/customerSupport.json';
import zhTWCustomOrder from './locales/zh-TW/customOrder.json';
import zhTWCustomOrderDetail from './locales/zh-TW/customOrderDetail.json';
import zhTWCustomOrders from './locales/zh-TW/customOrders.json';
import zhTWEventSale from './locales/zh-TW/eventSale.json';
import zhTWFreeSheets from './locales/zh-TW/freeSheets.json';
import zhTWGuidePage from './locales/zh-TW/guidePage.json';
import zhTWHome from './locales/zh-TW/home.json';
import zhTWMyOrders from './locales/zh-TW/myOrders.json';
import zhTWMypage from './locales/zh-TW/mypage.json';
import zhTWNotFound from './locales/zh-TW/notFound.json';
import zhTWRefundPolicy from './locales/zh-TW/refundPolicy.json';
import zhTWSeo from './locales/zh-TW/seo.json';
import zhTWSheetDetail from './locales/zh-TW/sheetDetail.json';
import zhTWSidebar from './locales/zh-TW/sidebar.json';
import zhTWCheckout from './locales/zh-TW/checkout.json';
import zhTWPaymentSuccess from './locales/zh-TW/paymentSuccess.json';

// JSON 파일을 언어별로 그룹화
type JsonModule = Record<string, unknown>;
const jsonFilesByLang: Record<string, Record<string, JsonModule>> = {
  ko: { authCallback: koAuthCallback, authForgotPassword: koAuthForgotPassword, authLogin: koAuthLogin, authRegister: koAuthRegister, authResetPassword: koAuthResetPassword, cartPage: koCartPage, categoriesPage: koCategoriesPage, checkout: koCheckout, collectionsDetail: koCollectionsDetail, collectionsPage: koCollectionsPage, companyAbout: koCompanyAbout, companyPartnership: koCompanyPartnership, customerSupport: koCustomerSupport, customOrder: koCustomOrder, customOrderDetail: koCustomOrderDetail, customOrders: koCustomOrders, eventSale: koEventSale, freeSheets: koFreeSheets, guidePage: koGuidePage, home: koHome, myOrders: koMyOrders, mypage: koMypage, notFound: koNotFound, refundPolicy: koRefundPolicy, seo: koSeo, sheetDetail: koSheetDetail, sidebar: koSidebar, paymentSuccess: koPaymentSuccess },
  en: { authCallback: enAuthCallback, authForgotPassword: enAuthForgotPassword, authLogin: enAuthLogin, authRegister: enAuthRegister, authResetPassword: enAuthResetPassword, cartPage: enCartPage, categoriesPage: enCategoriesPage, checkout: enCheckout, collectionsDetail: enCollectionsDetail, collectionsPage: enCollectionsPage, companyAbout: enCompanyAbout, companyPartnership: enCompanyPartnership, customerSupport: enCustomerSupport, customOrder: enCustomOrder, customOrderDetail: enCustomOrderDetail, customOrders: enCustomOrders, eventSale: enEventSale, freeSheets: enFreeSheets, guidePage: enGuidePage, home: enHome, myOrders: enMyOrders, mypage: enMypage, notFound: enNotFound, refundPolicy: enRefundPolicy, seo: enSeo, sheetDetail: enSheetDetail, sidebar: enSidebar, paymentSuccess: enPaymentSuccess },
  ja: { authCallback: jaAuthCallback, authForgotPassword: jaAuthForgotPassword, authLogin: jaAuthLogin, authRegister: jaAuthRegister, authResetPassword: jaAuthResetPassword, cartPage: jaCartPage, categoriesPage: jaCategoriesPage, checkout: jaCheckout, collectionsDetail: jaCollectionsDetail, collectionsPage: jaCollectionsPage, companyAbout: jaCompanyAbout, companyPartnership: jaCompanyPartnership, customerSupport: jaCustomerSupport, customOrder: jaCustomOrder, customOrderDetail: jaCustomOrderDetail, customOrders: jaCustomOrders, eventSale: jaEventSale, freeSheets: jaFreeSheets, guidePage: jaGuidePage, home: jaHome, myOrders: jaMyOrders, mypage: jaMypage, notFound: jaNotFound, refundPolicy: jaRefundPolicy, seo: jaSeo, sheetDetail: jaSheetDetail, sidebar: jaSidebar, paymentSuccess: jaPaymentSuccess },
  de: { authCallback: deAuthCallback, authForgotPassword: deAuthForgotPassword, authLogin: deAuthLogin, authRegister: deAuthRegister, authResetPassword: deAuthResetPassword, cartPage: deCartPage, categoriesPage: deCategoriesPage, checkout: deCheckout, collectionsDetail: deCollectionsDetail, collectionsPage: deCollectionsPage, companyAbout: deCompanyAbout, companyPartnership: deCompanyPartnership, customerSupport: deCustomerSupport, customOrder: deCustomOrder, customOrderDetail: deCustomOrderDetail, customOrders: deCustomOrders, eventSale: deEventSale, freeSheets: deFreeSheets, guidePage: deGuidePage, home: deHome, myOrders: deMyOrders, mypage: deMypage, notFound: deNotFound, refundPolicy: deRefundPolicy, seo: deSeo, sheetDetail: deSheetDetail, sidebar: deSidebar, paymentSuccess: dePaymentSuccess },
  es: { authCallback: esAuthCallback, authForgotPassword: esAuthForgotPassword, authLogin: esAuthLogin, authRegister: esAuthRegister, authResetPassword: esAuthResetPassword, cartPage: esCartPage, categoriesPage: esCategoriesPage, checkout: esCheckout, collectionsDetail: esCollectionsDetail, collectionsPage: esCollectionsPage, companyAbout: esCompanyAbout, companyPartnership: esCompanyPartnership, customerSupport: esCustomerSupport, customOrder: esCustomOrder, customOrderDetail: esCustomOrderDetail, customOrders: esCustomOrders, eventSale: esEventSale, freeSheets: esFreeSheets, guidePage: esGuidePage, home: esHome, myOrders: esMyOrders, mypage: esMypage, notFound: esNotFound, refundPolicy: esRefundPolicy, seo: esSeo, sheetDetail: esSheetDetail, sidebar: esSidebar, paymentSuccess: esPaymentSuccess },
  fr: { authCallback: frAuthCallback, authForgotPassword: frAuthForgotPassword, authLogin: frAuthLogin, authRegister: frAuthRegister, authResetPassword: frAuthResetPassword, cartPage: frCartPage, categoriesPage: frCategoriesPage, checkout: frCheckout, collectionsDetail: frCollectionsDetail, collectionsPage: frCollectionsPage, companyAbout: frCompanyAbout, companyPartnership: frCompanyPartnership, customerSupport: frCustomerSupport, customOrder: frCustomOrder, customOrderDetail: frCustomOrderDetail, customOrders: frCustomOrders, eventSale: frEventSale, freeSheets: frFreeSheets, guidePage: frGuidePage, home: frHome, myOrders: frMyOrders, mypage: frMypage, notFound: frNotFound, refundPolicy: frRefundPolicy, seo: frSeo, sheetDetail: frSheetDetail, sidebar: frSidebar, paymentSuccess: frPaymentSuccess },
  hi: { authCallback: hiAuthCallback, authForgotPassword: hiAuthForgotPassword, authLogin: hiAuthLogin, authRegister: hiAuthRegister, authResetPassword: hiAuthResetPassword, cartPage: hiCartPage, categoriesPage: hiCategoriesPage, checkout: hiCheckout, collectionsDetail: hiCollectionsDetail, collectionsPage: hiCollectionsPage, companyAbout: hiCompanyAbout, companyPartnership: hiCompanyPartnership, customerSupport: hiCustomerSupport, customOrder: hiCustomOrder, customOrderDetail: hiCustomOrderDetail, customOrders: hiCustomOrders, eventSale: hiEventSale, freeSheets: hiFreeSheets, guidePage: hiGuidePage, home: hiHome, myOrders: hiMyOrders, mypage: hiMypage, notFound: hiNotFound, refundPolicy: hiRefundPolicy, seo: hiSeo, sheetDetail: hiSheetDetail, sidebar: hiSidebar, paymentSuccess: hiPaymentSuccess },
  id: { authCallback: idAuthCallback, authForgotPassword: idAuthForgotPassword, authLogin: idAuthLogin, authRegister: idAuthRegister, authResetPassword: idAuthResetPassword, cartPage: idCartPage, categoriesPage: idCategoriesPage, checkout: idCheckout, collectionsDetail: idCollectionsDetail, collectionsPage: idCollectionsPage, companyAbout: idCompanyAbout, companyPartnership: idCompanyPartnership, customerSupport: idCustomerSupport, customOrder: idCustomOrder, customOrderDetail: idCustomOrderDetail, customOrders: idCustomOrders, eventSale: idEventSale, freeSheets: idFreeSheets, guidePage: idGuidePage, home: idHome, myOrders: idMyOrders, mypage: idMypage, notFound: idNotFound, refundPolicy: idRefundPolicy, seo: idSeo, sheetDetail: idSheetDetail, sidebar: idSidebar, paymentSuccess: idPaymentSuccess },
  it: { authCallback: itAuthCallback, authForgotPassword: itAuthForgotPassword, authLogin: itAuthLogin, authRegister: itAuthRegister, authResetPassword: itAuthResetPassword, cartPage: itCartPage, categoriesPage: itCategoriesPage, checkout: itCheckout, collectionsDetail: itCollectionsDetail, collectionsPage: itCollectionsPage, companyAbout: itCompanyAbout, companyPartnership: itCompanyPartnership, customerSupport: itCustomerSupport, customOrder: itCustomOrder, customOrderDetail: itCustomOrderDetail, customOrders: itCustomOrders, eventSale: itEventSale, freeSheets: itFreeSheets, guidePage: itGuidePage, home: itHome, myOrders: itMyOrders, mypage: itMypage, notFound: itNotFound, refundPolicy: itRefundPolicy, seo: itSeo, sheetDetail: itSheetDetail, sidebar: itSidebar, paymentSuccess: itPaymentSuccess },
  pt: { authCallback: ptAuthCallback, authForgotPassword: ptAuthForgotPassword, authLogin: ptAuthLogin, authRegister: ptAuthRegister, authResetPassword: ptAuthResetPassword, cartPage: ptCartPage, categoriesPage: ptCategoriesPage, checkout: ptCheckout, collectionsDetail: ptCollectionsDetail, collectionsPage: ptCollectionsPage, companyAbout: ptCompanyAbout, companyPartnership: ptCompanyPartnership, customerSupport: ptCustomerSupport, customOrder: ptCustomOrder, customOrderDetail: ptCustomOrderDetail, customOrders: ptCustomOrders, eventSale: ptEventSale, freeSheets: ptFreeSheets, guidePage: ptGuidePage, home: ptHome, myOrders: ptMyOrders, mypage: ptMypage, notFound: ptNotFound, refundPolicy: ptRefundPolicy, seo: ptSeo, sheetDetail: ptSheetDetail, sidebar: ptSidebar, paymentSuccess: ptPaymentSuccess },
  ru: { authCallback: ruAuthCallback, authForgotPassword: ruAuthForgotPassword, authLogin: ruAuthLogin, authRegister: ruAuthRegister, authResetPassword: ruAuthResetPassword, cartPage: ruCartPage, categoriesPage: ruCategoriesPage, checkout: ruCheckout, collectionsDetail: ruCollectionsDetail, collectionsPage: ruCollectionsPage, companyAbout: ruCompanyAbout, companyPartnership: ruCompanyPartnership, customerSupport: ruCustomerSupport, customOrder: ruCustomOrder, customOrderDetail: ruCustomOrderDetail, customOrders: ruCustomOrders, eventSale: ruEventSale, freeSheets: ruFreeSheets, guidePage: ruGuidePage, home: ruHome, myOrders: ruMyOrders, mypage: ruMypage, notFound: ruNotFound, refundPolicy: ruRefundPolicy, seo: ruSeo, sheetDetail: ruSheetDetail, sidebar: ruSidebar, paymentSuccess: ruPaymentSuccess },
  th: { authCallback: thAuthCallback, authForgotPassword: thAuthForgotPassword, authLogin: thAuthLogin, authRegister: thAuthRegister, authResetPassword: thAuthResetPassword, cartPage: thCartPage, categoriesPage: thCategoriesPage, checkout: thCheckout, collectionsDetail: thCollectionsDetail, collectionsPage: thCollectionsPage, companyAbout: thCompanyAbout, companyPartnership: thCompanyPartnership, customerSupport: thCustomerSupport, customOrder: thCustomOrder, customOrderDetail: thCustomOrderDetail, customOrders: thCustomOrders, eventSale: thEventSale, freeSheets: thFreeSheets, guidePage: thGuidePage, home: thHome, myOrders: thMyOrders, mypage: thMypage, notFound: thNotFound, refundPolicy: thRefundPolicy, seo: thSeo, sheetDetail: thSheetDetail, sidebar: thSidebar, paymentSuccess: thPaymentSuccess },
  tr: { authCallback: trAuthCallback, authForgotPassword: trAuthForgotPassword, authLogin: trAuthLogin, authRegister: trAuthRegister, authResetPassword: trAuthResetPassword, cartPage: trCartPage, categoriesPage: trCategoriesPage, checkout: trCheckout, collectionsDetail: trCollectionsDetail, collectionsPage: trCollectionsPage, companyAbout: trCompanyAbout, companyPartnership: trCompanyPartnership, customerSupport: trCustomerSupport, customOrder: trCustomOrder, customOrderDetail: trCustomOrderDetail, customOrders: trCustomOrders, eventSale: trEventSale, freeSheets: trFreeSheets, guidePage: trGuidePage, home: trHome, myOrders: trMyOrders, mypage: trMypage, notFound: trNotFound, refundPolicy: trRefundPolicy, seo: trSeo, sheetDetail: trSheetDetail, sidebar: trSidebar, paymentSuccess: trPaymentSuccess },
  uk: { authCallback: ukAuthCallback, authForgotPassword: ukAuthForgotPassword, authLogin: ukAuthLogin, authRegister: ukAuthRegister, authResetPassword: ukAuthResetPassword, cartPage: ukCartPage, categoriesPage: ukCategoriesPage, checkout: ukCheckout, collectionsDetail: ukCollectionsDetail, collectionsPage: ukCollectionsPage, companyAbout: ukCompanyAbout, companyPartnership: ukCompanyPartnership, customerSupport: ukCustomerSupport, customOrder: ukCustomOrder, customOrderDetail: ukCustomOrderDetail, customOrders: ukCustomOrders, eventSale: ukEventSale, freeSheets: ukFreeSheets, guidePage: ukGuidePage, home: ukHome, myOrders: ukMyOrders, mypage: ukMypage, notFound: ukNotFound, refundPolicy: ukRefundPolicy, seo: ukSeo, sheetDetail: ukSheetDetail, sidebar: ukSidebar, paymentSuccess: ukPaymentSuccess },
  vi: { authCallback: viAuthCallback, authForgotPassword: viAuthForgotPassword, authLogin: viAuthLogin, authRegister: viAuthRegister, authResetPassword: viAuthResetPassword, cartPage: viCartPage, categoriesPage: viCategoriesPage, checkout: viCheckout, collectionsDetail: viCollectionsDetail, collectionsPage: viCollectionsPage, companyAbout: viCompanyAbout, companyPartnership: viCompanyPartnership, customerSupport: viCustomerSupport, customOrder: viCustomOrder, customOrderDetail: viCustomOrderDetail, customOrders: viCustomOrders, eventSale: viEventSale, freeSheets: viFreeSheets, guidePage: viGuidePage, home: viHome, myOrders: viMyOrders, mypage: viMypage, notFound: viNotFound, refundPolicy: viRefundPolicy, seo: viSeo, sheetDetail: viSheetDetail, sidebar: viSidebar, paymentSuccess: viPaymentSuccess },
  'zh-CN': { authCallback: zhCNAuthCallback, authForgotPassword: zhCNAuthForgotPassword, authLogin: zhCNAuthLogin, authRegister: zhCNAuthRegister, authResetPassword: zhCNAuthResetPassword, cartPage: zhCNCartPage, categoriesPage: zhCNCategoriesPage, checkout: zhCNCheckout, collectionsDetail: zhCNCollectionsDetail, collectionsPage: zhCNCollectionsPage, companyAbout: zhCNCompanyAbout, companyPartnership: zhCNCompanyPartnership, customerSupport: zhCNCustomerSupport, customOrder: zhCNCustomOrder, customOrderDetail: zhCNCustomOrderDetail, customOrders: zhCNCustomOrders, eventSale: zhCNEventSale, freeSheets: zhCNFreeSheets, guidePage: zhCNGuidePage, home: zhCNHome, myOrders: zhCNMyOrders, mypage: zhCNMypage, notFound: zhCNNotFound, refundPolicy: zhCNRefundPolicy, seo: zhCNSeo, sheetDetail: zhCNSheetDetail, sidebar: zhCNSidebar, paymentSuccess: zhCNPaymentSuccess },
  'zh-TW': { authCallback: zhTWAuthCallback, authForgotPassword: zhTWAuthForgotPassword, authLogin: zhTWAuthLogin, authRegister: zhTWAuthRegister, authResetPassword: zhTWAuthResetPassword, cartPage: zhTWCartPage, categoriesPage: zhTWCategoriesPage, checkout: zhTWCheckout, collectionsDetail: zhTWCollectionsDetail, collectionsPage: zhTWCollectionsPage, companyAbout: zhTWCompanyAbout, companyPartnership: zhTWCompanyPartnership, customerSupport: zhTWCustomerSupport, customOrder: zhTWCustomOrder, customOrderDetail: zhTWCustomOrderDetail, customOrders: zhTWCustomOrders, eventSale: zhTWEventSale, freeSheets: zhTWFreeSheets, guidePage: zhTWGuidePage, home: zhTWHome, myOrders: zhTWMyOrders, mypage: zhTWMypage, notFound: zhTWNotFound, refundPolicy: zhTWRefundPolicy, seo: zhTWSeo, sheetDetail: zhTWSheetDetail, sidebar: zhTWSidebar, paymentSuccess: zhTWPaymentSuccess },
};

// JSON 파일 평탄화 함수
const flattenJson = (obj: Record<string, unknown>, prefix = ''): Record<string, unknown> => {
  const result: Record<string, unknown> = {};
  Object.keys(obj).forEach((key) => {
    const newKey = prefix ? `${prefix}.${key}` : key;
    if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
      Object.assign(result, flattenJson(obj[key] as Record<string, unknown>, newKey));
    } else {
      result[newKey] = obj[key];
    }
  });
  return result;
};

// JSON 번역을 언어별로 처리
const jsonMessages: Record<string, { translation: Record<string, unknown> }> = {};

Object.entries(jsonFilesByLang).forEach(([lang, files]) => {
  if (!jsonMessages[lang]) {
    jsonMessages[lang] = { translation: {} };
  }
  Object.entries(files).forEach(([fileName, jsonData]) => {
    const flattened = flattenJson(jsonData as Record<string, unknown>, fileName);
    Object.assign(jsonMessages[lang].translation, flattened);
  });
});

// 기존 TypeScript 번역과 JSON 번역 병합
const mergedMessages: Record<string, { translation: Record<string, unknown> }> = { ...messages };

Object.keys(jsonMessages).forEach((lang) => {
  if (!mergedMessages[lang]) {
    mergedMessages[lang] = { translation: {} };
  }
  // JSON 번역을 기존 번역에 병합 (JSON이 우선순위)
  mergedMessages[lang].translation = {
    ...mergedMessages[lang].translation,
    ...jsonMessages[lang].translation,
  };
});

const getCurrentHostLanguage = () => {
  if (typeof window === 'undefined') {
    return defaultLanguage;
  }

  // 1. URL Path Check - PRIMARY METHOD
  // Check for /ko/, /ja/, /de/, etc. in path
  const pathLang = getLanguageFromPath(window.location.pathname);
  if (pathLang && supportedLanguages.includes(pathLang)) {
    return pathLang;
  }

  // 2. Cookie Check (set by middleware)
  const cookieLocale = document.cookie
    .split('; ')
    .find(row => row.startsWith('locale='))
    ?.split('=')[1];
  if (cookieLocale && supportedLanguages.includes(cookieLocale)) {
    return cookieLocale;
  }

  // 3. Default Language (English for root path)
  return defaultLanguage;
};

const initialLanguage = getCurrentHostLanguage();

i18n
  .use(initReactI18next)
  .init({
    fallbackLng: defaultLanguage,
    lng: initialLanguage,
    supportedLngs: supportedLanguages,
    debug: false,
    resources: mergedMessages,
    interpolation: {
      escapeValue: false,
    },
  });

// Path-based language enforcement
if (typeof window !== 'undefined') {
  const pathLanguage = getCurrentHostLanguage();
  if (i18n.language !== pathLanguage) {
    i18n.changeLanguage(pathLanguage);
  }

  // Update HTML lang attribute on language change
  i18n.on('languageChanged', (lng) => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = lng;
    }

    // Enforce path-based language (prevent manual overrides)
    const currentPathLanguage = getCurrentHostLanguage();
    if (lng !== currentPathLanguage) {
      i18n.changeLanguage(currentPathLanguage);
    }
  });
}

export default i18n;
