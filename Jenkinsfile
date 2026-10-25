
pipeline {
    agent any

    stages {
        stage('Checkout') {
            steps {
                echo 'Jenkins has checked out the SmartClass repository.'
            }
        }

        stage('Install Dependencies') {
            steps {
                sh 'npm ci'
            }
        }

        stage('Run Tests') {
            steps {
                sh 'npm test'
            }
        }

        stage('Build Docker Image') {
            steps {
                sh 'docker build -t smartclass:latest .'
            }
        }
    }

    post {
        success {
            echo 'SmartClass CI pipeline completed successfully!'
        }
        failure {
            echo 'Pipeline failed. Check the stage logs for details.'
        }
    }
}
