# CI/CD Setup Guide

This guide will help you set up automated deployments for both the Cloudflare Worker and Google Apps Script components.

## Prerequisites

Before setting up CI/CD, ensure you have:

1. A GitHub account with access to this repository
2. A Cloudflare account with a Workers subscription
3. A Google account with access to Google Apps Script
4. Local installations of `clasp` and `wrangler` (for testing)

## Quick Setup Checklist

- [ ] Set up Cloudflare API Token
- [ ] Configure CLASP credentials
- [ ] Add secrets to GitHub repository
- [ ] Test manual workflow trigger
- [ ] Push changes to main branch to test automatic deployment

## Step 1: Cloudflare Worker Setup

### 1.1 Create Cloudflare API Token

1. Log in to your [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. Navigate to **My Profile** → **API Tokens**
3. Click **Create Token**
4. Use the **Edit Cloudflare Workers** template, or create a custom token with:
   - **Permissions**: `Account > Cloudflare Workers Scripts > Edit`
   - **Account Resources**: Include your account
5. Click **Continue to Summary** → **Create Token**
6. **Copy the token** (you won't be able to see it again!)

### 1.2 Add Token to GitHub

1. Go to your GitHub repository
2. Navigate to **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. Name: `CLOUDFLARE_API_TOKEN`
5. Value: Paste the token you copied
6. Click **Add secret**

## Step 2: Google Apps Script Setup

### 2.1 Authenticate with clasp locally

First, you need to authenticate with clasp on your local machine:

```bash
# Install clasp globally (if not already installed)
npm install -g @google/clasp

# Login to Google
clasp login
```

This will open a browser window for you to authenticate with your Google account.

### 2.2 Create or Link Apps Script Project

If you haven't already:

```bash
# Create a new Apps Script project
clasp create --title "Utils for GAS" --type sheets --rootDir ./appsscript

# Or clone an existing project
clasp clone YOUR_SCRIPT_ID --rootDir ./appsscript
```

This will update your `.clasp.json` file with the script ID.

### 2.3 Get clasp credentials

```bash
# On macOS/Linux
cat ~/.clasprc.json

# On Windows
type %USERPROFILE%\.clasprc.json
```

Copy the **entire JSON output**. It should look something like:

```json
{
  "token": {
    "access_token": "...",
    "refresh_token": "...",
    "scope": "...",
    "token_type": "Bearer",
    "expiry_date": ...
  },
  "oauth2ClientSettings": {
    "clientId": "...",
    "clientSecret": "...",
    "redirectUri": "..."
  },
  "isLocalCreds": false
}
```

### 2.4 Add Credentials to GitHub

1. Go to your GitHub repository
2. Navigate to **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. Name: `CLASP_CREDENTIALS`
5. Value: Paste the entire JSON object
6. Click **Add secret**

### 2.5 Verify .clasp.json

Make sure your `.clasp.json` file in the repository contains your script ID:

```json
{
  "scriptId": "YOUR_ACTUAL_SCRIPT_ID_HERE",
  "rootDir": "./appsscript"
}
```

**Important**: Commit this file to your repository (it's safe - it only contains the script ID, not credentials).

## Step 3: Testing the Workflows

### Manual Trigger Test

1. Go to your repository on GitHub
2. Click the **Actions** tab
3. Select **Deploy Cloudflare Worker** or **Deploy AppsScript**
4. Click **Run workflow**
5. Select branch: `main`
6. Click **Run workflow**
7. Watch the workflow run and check for any errors

### Automatic Trigger Test

1. Make a small change to a file in `worker/src/` or `appsscript/src/`
2. Commit and push to the `main` branch
3. Go to the **Actions** tab on GitHub
4. You should see a new workflow run automatically triggered
5. Click on it to view logs and ensure it completes successfully

## Troubleshooting

### Cloudflare Worker Deployment Fails

**Error: "Authentication error"**
- Verify your `CLOUDFLARE_API_TOKEN` is correct
- Ensure the token has not expired
- Check that the token has the correct permissions

**Error: "Script not found"**
- Verify your `wrangler.toml` is correctly configured
- Ensure your worker name is valid

### AppsScript Deployment Fails

**Error: "User has not enabled the Apps Script API"**
- Go to https://script.google.com/home/usersettings
- Enable the Apps Script API

**Error: "Invalid credentials"**
- Regenerate your clasp credentials by running `clasp login` locally
- Copy the new credentials from `~/.clasprc.json`
- Update the `CLASP_CREDENTIALS` secret on GitHub

**Error: "Project not found"**
- Verify your `.clasp.json` has the correct `scriptId`
- Ensure the script ID exists and you have access to it

**Error: "Push failed"**
- Make sure the `rootDir` in `.clasp.json` is correct
- Verify that your Apps Script files are in the correct directory

### General Issues

**Workflow doesn't trigger automatically**
- Check the `paths` filters in the workflow files
- Ensure your changes are in the specified paths
- Verify you're pushing to the `main` branch

**Dependencies installation fails**
- Check if `package-lock.json` is committed
- Verify `package.json` has all required dependencies

## Security Best Practices

1. **Never commit credentials**: Keep `.clasprc.json` in `.gitignore`
2. **Rotate tokens regularly**: Update your Cloudflare API tokens periodically
3. **Use minimal permissions**: Grant only the permissions needed for deployment
4. **Review workflow runs**: Regularly check the Actions tab for suspicious activity
5. **Enable branch protection**: Consider requiring reviews before merging to `main`

## Additional Resources

- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Cloudflare Workers Documentation](https://developers.cloudflare.com/workers/)
- [Google Apps Script Documentation](https://developers.google.com/apps-script)
- [Clasp Documentation](https://github.com/google/clasp)
- [Wrangler Documentation](https://developers.cloudflare.com/workers/wrangler/)

## Getting Help

If you encounter issues:

1. Check the workflow logs in the Actions tab
2. Review the error messages carefully
3. Consult the documentation links above
4. Open an issue in the repository with:
   - The error message
   - The workflow log (with secrets redacted)
   - Steps to reproduce the issue
