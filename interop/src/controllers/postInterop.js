"use strict";

const { pki } = require("node-forge");
const Joi = require("joi");
const {
  IoTClient,
  RegisterCertificateWithoutCACommand,
  CreateThingCommand,
  AttachThingPrincipalCommand,
  DescribeEndpointCommand,
} = require("@aws-sdk/client-iot");

const requestMiddleware = require("../middleware/request");

const client = new IoTClient();

const postInteropSchema = Joi.object().keys({
  action: Joi.string().valid("status", "provision", "message").required(),
  certs: Joi.when("action", {
    is: "provision",
    then: Joi.array().items(
      Joi.object().keys({
        ref: Joi.string().required(),
        cert: Joi.string().base64().required(),
      })
    ),
  }),
  fingerprint: Joi.when("action", {
    is: "message",
    then: Joi.string().required(),
  }),
});

async function post(req, res, next) {
  const { action } = req.body;

  if (action === "provision") {
    const { certs } = req.body;
    let resp = [];

    const endpoint = await getEndpoint();

    for (const item of certs) {
      let certBuf;
      let parsedCert;

      try {
        certBuf = Buffer.from(item.cert, "base64");
        parsedCert = pki.certificateFromPem(certBuf.toString("ascii"), true);
      } catch (err) {
        resp.push({
          ref: item.ref,
          status: "ERROR",
          message: "Cannot decode certitifcate",
        });
        continue;
      }

      try {
        await createAndRegisterThing(
          certBuf.toString("ascii"),
          parsedCert.serialNumber
        );

        resp.push({
          ref: item.ref,
          status: "SUCCESS",
          endpoint: endpoint,
        });
      } catch (err) {
        resp.push({
          ref: item.ref,
          status: "ERROR",
          message: "Failed creating and registering thing",
        });
        continue;
      }
    }

    return res.send(resp);
  }

  return res.send({
    message: "Not yet implemented.",
    action,
  });
}

async function getEndpoint() {
  let resp;

  try {
    const depCmd = new DescribeEndpointCommand({
      endpointType: "iot:Data-ATS",
    });

    const depResp = await client.send(depCmd);
    resp = depResp.endpointAddress;
  } catch (err) {
    resp = null;
  }

  return resp;
}

async function createAndRegisterThing(cert, serialNum) {
  if (!cert) throw Error("No certificate provided");

  let certArn;
  let certId;
  try {
    const regCmd = new RegisterCertificateWithoutCACommand({
      certificatePem: cert,
      status: "ACTIVE",
    });

    const regResp = await client.send(regCmd);

    certArn = regResp.certificateArn;
    certId = regResp.certificateId;
  } catch (err) {
    if (err.name == "ResourceAlreadyExistsException") {
      certArn = err.resourceArn;
      certId = err.resourceId;
    } else {
      throw err;
    }
  }

  const thingCmd = new CreateThingCommand({
    thingName: certId,
    attributePayload: {
      attributes: {
        serialNumber: serialNum,
      },
      merge: true,
    },
  });

  const thingResp = await client.send(thingCmd);

  const policyCmd = new AttachThingPrincipalCommand({
    thingName: thingResp.thingName,
    principal: certArn,
  });

  await client.send(policyCmd);

  return true;
}

module.exports = requestMiddleware(post, {
  validation: { body: postInteropSchema },
});
