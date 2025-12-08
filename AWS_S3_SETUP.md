# AWS Setup Guide: S3 Bucket + IAM User + Inline Policy

This guide explains how to create an S3 bucket, set up an IAM user,
generate access keys, and attach an inline policy that grants
permissions to a specific bucket.

------------------------------------------------------------------------

## 1. Create an S3 Bucket

1.  Log into the **AWS Management Console**.
2.  Open **Services → S3**.
3.  Click **Create bucket**.
4.  Enter a **unique bucket name** of your choice.
    -   Example: `my-backup-vault`
5.  Leave the default configuration options unchanged (unless you have
    specific requirements).
6.  Click **Create bucket**.
7.  After the bucket is created, open it and go to the **Properties**
    tab.
8.  Locate and record the **Bucket ARN**.
    -   Example format:

            arn:aws:s3:::my-backup-vault

------------------------------------------------------------------------

## 2. Create an IAM User

1.  Go to **Services → IAM**.
2.  Select **Users** from the left sidebar.
3.  Click **Create user**.
4.  Enter a username.
    -   Example: `my-app-user`
5.  Click **Next**.
6.  Under **Permissions options**, select **Attach policies directly**
    (leave empty for now).
7.  Click **Next**, then **Create user**.

------------------------------------------------------------------------

## 3. Generate Access Keys

1.  Open the IAM user you just created.
2.  Navigate to the **Security credentials** tab.
3.  Scroll to the **Access keys** section and click **Create access
    key**.
4.  Choose **Application running outside AWS**.
5.  Click **Next**, then **Create access key**.
6.  Save the **Access Key ID** and **Secret Access Key** securely.
    -   You will not be able to view the secret key again later.

------------------------------------------------------------------------

## 4. Create an Inline Policy for Bucket Access

1.  While viewing the IAM user, go to the **Permissions** tab.

2.  Scroll to **Inline policies** and click **Add inline policy**.

3.  Select the **JSON** tab.

4.  Replace the contents with the following policy, updating the bucket
    name to yours:

    ``` json
    {
      "Version": "2012-10-17",
      "Statement": [
        {
          "Effect": "Allow",
          "Action": [
            "s3:GetObject",
            "s3:PutObject",
            "s3:DeleteObject",
            "s3:ListBucket"
          ],
          "Resource": [
            "arn:aws:s3:::my-backup-vault",
            "arn:aws:s3:::my-backup-vault/*"
          ]
        }
      ]
    }
    ```

5.  Click **Review policy**.

6.  Name the policy (example: `S3BucketAccessPolicy`).

7.  Click **Create policy**.

------------------------------------------------------------------------

## 5. Setup Complete

You now have:

-   An S3 bucket configured for storing data.
-   An IAM user with:
    -   Access key credentials
    -   Permissions to list, read, write, and delete objects in your
        bucket.

Use the Access Key ID, Secret Access Key, and bucket name in your
application to enable secure S3 interactions.

